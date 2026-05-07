(function () {
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const { FEATURE_DEFINITIONS, LOCATION_PRESETS } = window.LPF_DATA;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const toRad = (value) => (value * Math.PI) / 180;
  const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const locationIndex = LOCATION_PRESETS.flatMap((location) => {
    const names = [location.name, location.area].concat(location.aliases || []);
    return names.map((alias) => ({
      alias,
      normalized: normalizeText(alias),
      location
    }));
  }).sort((a, b) => b.normalized.length - a.normalized.length);

  function resolveLocation(input) {
    if (input && isNumber(input.lat) && isNumber(input.lng)) {
      return {
        name: input.name || "Pinned location",
        area: input.area || input.name || "Custom",
        lat: input.lat,
        lng: input.lng,
        transitScore: input.transitScore || 6,
        source: "custom"
      };
    }

    const normalized = normalizeText(input);
    if (!normalized) return null;

    const compact = normalized.replace(/\s/g, "");
    const exact = locationIndex.find((entry) => entry.normalized === normalized);
    if (exact) return { ...exact.location, source: "preset" };

    const postcodePrefix = locationIndex.find((entry) => {
      const aliasCompact = entry.normalized.replace(/\s/g, "");
      return aliasCompact.length >= 2 && compact.startsWith(aliasCompact);
    });
    if (postcodePrefix) return { ...postcodePrefix.location, source: "preset" };

    const fuzzy = locationIndex.find((entry) => {
      return (
        entry.normalized.includes(normalized) ||
        normalized.includes(entry.normalized)
      );
    });

    return fuzzy ? { ...fuzzy.location, source: "preset" } : null;
  }

  function getLocationSuggestions() {
    return LOCATION_PRESETS.map((location) => location.name).sort();
  }

  function haversineKm(a, b) {
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const x =
      sinLat * sinLat +
      Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
    return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function calculateCentroid(points) {
    if (!points.length) return null;
    const totals = points.reduce(
      (acc, point) => {
        acc.lat += point.lat;
        acc.lng += point.lng;
        return acc;
      },
      { lat: 0, lng: 0 }
    );

    return {
      lat: totals.lat / points.length,
      lng: totals.lng / points.length
    };
  }

  function findNearestArea(point) {
    if (!point) return null;
    const nearest = LOCATION_PRESETS.map((location) => ({
      location,
      distance: haversineKm(point, location)
    })).sort((a, b) => a.distance - b.distance)[0];

    return nearest
      ? {
          name: nearest.location.area || nearest.location.name,
          distanceKm: nearest.distance
        }
      : null;
  }

  function getTargetPoint(people, options) {
    const style = options.style || "middle";

    if (style === "closest_me" && people[0]) {
      return {
        point: people[0],
        label: `Near ${people[0].name}`,
        basis: "closest_me"
      };
    }

    if (style === "closest_person") {
      const person =
        people.find((item) => item.id === options.selectedPersonId) || people[0];
      if (person) {
        return {
          point: person,
          label: `Near ${person.name}`,
          basis: "closest_person"
        };
      }
    }

    if (style === "near_area" && options.targetArea) {
      const area = resolveLocation(options.targetArea);
      if (area) {
        return {
          point: area,
          label: `Near ${area.name}`,
          basis: "near_area"
        };
      }
    }

    const centroid = calculateCentroid(people);
    return {
      point: centroid,
      label: style === "best" ? "Best overall balance" : "Meet in the middle",
      basis: style === "best" ? "best" : "middle"
    };
  }

  function formatClock(minutes) {
    const wrapped = ((minutes % 1440) + 1440) % 1440;
    const hours = Math.floor(wrapped / 60);
    const mins = wrapped % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }

  function periodLabel(period) {
    return `${formatClock(period[0])}-${formatClock(period[1])}`;
  }

  function openingStatus(pub, date = new Date()) {
    const day = date.getDay();
    const minutes = date.getHours() * 60 + date.getMinutes();
    const periods = pub.openingHours?.[day] || [];
    const prevDay = (day + 6) % 7;
    const previousPeriods = pub.openingHours?.[prevDay] || [];
    const todayHours = periods.length ? periods.map(periodLabel).join(", ") : "Closed today";

    const openToday = periods.find((period) => {
      const [start, end] = period;
      if (end > 1440) return minutes >= start || minutes + 1440 < end;
      return minutes >= start && minutes < end;
    });

    if (openToday) {
      return {
        openNow: true,
        todayHours,
        statusText: `Open now - closes ${formatClock(openToday[1])}`,
        closesAt: formatClock(openToday[1])
      };
    }

    const openFromYesterday = previousPeriods.find((period) => {
      const [, end] = period;
      return end > 1440 && minutes + 1440 < end;
    });

    if (openFromYesterday) {
      return {
        openNow: true,
        todayHours,
        statusText: `Open now - closes ${formatClock(openFromYesterday[1])}`,
        closesAt: formatClock(openFromYesterday[1])
      };
    }

    const laterToday = periods.find((period) => period[0] > minutes);
    if (laterToday) {
      return {
        openNow: false,
        todayHours,
        statusText: `Closed - opens ${formatClock(laterToday[0])}`,
        opensAt: formatClock(laterToday[0])
      };
    }

    for (let offset = 1; offset <= 7; offset += 1) {
      const nextDay = (day + offset) % 7;
      const nextPeriods = pub.openingHours?.[nextDay] || [];
      if (nextPeriods.length) {
        return {
          openNow: false,
          todayHours,
          statusText: `Closed - opens ${DAY_NAMES[nextDay]} ${formatClock(nextPeriods[0][0])}`,
          opensAt: formatClock(nextPeriods[0][0])
        };
      }
    }

    return {
      openNow: false,
      todayHours,
      statusText: "Closed",
      opensAt: null
    };
  }

  function fullWeekHours(pub) {
    return DAY_NAMES.map((dayName, day) => {
      const periods = pub.openingHours?.[day] || [];
      return {
        day: dayName,
        hours: periods.length ? periods.map(periodLabel).join(", ") : "Closed"
      };
    });
  }

  function crossesRiver(a, b) {
    const northA = a.lat >= 51.495;
    const northB = b.lat >= 51.495;
    return northA !== northB;
  }

  function estimateTravelTime(origin, pub) {
    const distanceKm = haversineKm(origin, pub);
    const transitFactor = ((origin.transitScore || 6) + (pub.transitScore || 6)) / 2;
    const hubBonus = origin.transitScore >= 9 && pub.transitScore >= 9 ? 4 : 0;
    const riverPenalty = crossesRiver(origin, pub) ? 4 : 0;
    const outerPenalty = distanceKm > 12 ? (distanceKm - 12) * 0.9 : 0;
    const time = 12 + distanceKm * 2.45 - (transitFactor - 6) * 1.6 - hubBonus + riverPenalty + outerPenalty;
    return Math.round(clamp(time, 8, 85));
  }

  function estimateBusy(pub, date = new Date(), preferences = {}) {
    const day = date.getDay();
    const minutes = date.getHours() * 60 + date.getMinutes();
    const evening = minutes >= 17 * 60 && minutes <= 23 * 60;
    const lateAfternoon = minutes >= 14 * 60 && minutes <= 21 * 60;
    const sundayLunch = day === 0 && minutes >= 12 * 60 && minutes <= 16 * 60;
    const quizWindow = minutes >= 18 * 60 && minutes <= 22 * 60;
    const baseMap = { quiet: 0.5, moderate: 1.4, busy: 2.4 };
    let intensity = baseMap[pub.busyProfile?.base] || 1.4;

    if ((day === 5 || day === 6) && evening) intensity += 1.2;
    if (day >= 1 && day <= 4 && evening && (pub.busyProfile?.centrality || 0) >= 8) intensity += 0.5;
    if (sundayLunch && pub.features.sunday_roast) intensity += pub.busyProfile?.roastPull || 1.2;
    if (pub.busyProfile?.quizDay === day && quizWindow) intensity += 1.8;
    if ((day === 0 || day === 6) && lateAfternoon && pub.features.showing_football) {
      intensity += pub.busyProfile?.sportsPull || 1;
    }
    if ((pub.reviewCount || 0) > 2500 && evening) intensity += 0.4;

    let level = "Usually quiet";
    let key = "quiet";
    if (intensity >= 3.4) {
      level = "Likely busy";
      key = "likely_busy";
    } else if (intensity >= 1.4) {
      level = "Moderate";
      key = "moderate";
    }

    const scoreMap = preferences.notBusy
      ? { quiet: 100, moderate: 72, likely_busy: 25 }
      : { quiet: 82, moderate: 92, likely_busy: 76 };

    return {
      key,
      level,
      score: scoreMap[key],
      detail:
        key === "likely_busy"
          ? "Estimated from day, time, sport, quiz, roast and central-location signals."
          : "Estimated from day, time and pub profile."
    };
  }

  function scoreTravel(people, pub, targetPoint) {
    const travelTimes = people.map((person) => ({
      person: person.name,
      minutes: estimateTravelTime(person, pub)
    }));
    const minutes = travelTimes.map((item) => item.minutes);
    const average = minutes.reduce((sum, item) => sum + item, 0) / minutes.length;
    const max = Math.max(...minutes);
    const min = Math.min(...minutes);
    const spread = max - min;
    const midpointDistanceKm = targetPoint ? haversineKm(targetPoint, pub) : 0;

    const averageScore = clamp(100 - Math.max(0, average - 15) * 2.2, 0, 100);
    const maxScore = clamp(100 - Math.max(0, max - 20) * 1.8, 0, 100);
    const fairnessScore = clamp(100 - spread * 3.2, 0, 100);
    const midpointScore = clamp(100 - midpointDistanceKm * 9, 0, 100);

    return {
      travelTimes,
      averageTravelTimeMinutes: Math.round(average),
      maxTravelTimeMinutes: Math.round(max),
      spreadMinutes: Math.round(spread),
      midpointDistanceKm,
      travelScore: Math.round(
        averageScore * 0.4 +
          fairnessScore * 0.3 +
          maxScore * 0.2 +
          midpointScore * 0.1
      )
    };
  }

  function scorePreferences(pub, selectedFeatureKeys) {
    const matched = selectedFeatureKeys.filter((key) => pub.features[key]);
    const missing = selectedFeatureKeys.filter((key) => !pub.features[key]);
    const preferenceScore = selectedFeatureKeys.length
      ? Math.round((matched.length / selectedFeatureKeys.length) * 100)
      : Math.round(
          72 +
            FEATURE_DEFINITIONS.filter((feature) => pub.features[feature.key]).length * 2.4
        );

    return {
      matchedPreferences: matched,
      missingPreferences: missing,
      preferenceScore: clamp(preferenceScore, 0, 100)
    };
  }

  function scoreRating(pub) {
    const ratingPart = ((pub.googleRating || 0) / 5) * 75;
    const reviewPart = Math.min(25, Math.log10((pub.reviewCount || 0) + 1) * 7);
    return Math.round(clamp(ratingPart + reviewPart, 0, 100));
  }

  function scoreOpening(status) {
    if (status.openNow) return 100;
    if (status.opensAt) return 62;
    return 35;
  }

  function featureLabels(keys) {
    return keys.map((key) => {
      const definition = FEATURE_DEFINITIONS.find((feature) => feature.key === key);
      return definition ? definition.label : key.replace(/_/g, " ");
    });
  }

  function buildExplanation(result, pub, selectedFeatureKeys, status, busy) {
    const parts = [];

    if (result.averageTravelTimeMinutes <= 32 && result.spreadMinutes <= 14) {
      parts.push("good balance for the whole group");
    } else if (result.averageTravelTimeMinutes <= 35) {
      parts.push("solid average journey time");
    } else {
      parts.push("strong pub fit despite longer journeys");
    }

    if (pub.googleRating >= 4.5) {
      parts.push(`high rating of ${pub.googleRating}`);
    } else if (pub.reviewCount >= 1500) {
      parts.push("well-reviewed London pub");
    }

    if (selectedFeatureKeys.length) {
      parts.push(
        `matches ${result.matchedPreferences.length} of ${selectedFeatureKeys.length} selected preferences`
      );
    }

    if (status.openNow) {
      parts.push(`open now until ${status.closesAt}`);
    }

    if (busy.key !== "likely_busy") {
      parts.push(`${busy.level.toLowerCase()} busyness estimate`);
    }

    return `Recommended because it offers ${parts.join(", ")}.`;
  }

  function passesBaseFilters(pub, preferences, date, includeFeatureFilters) {
    const selectedFeatureKeys = preferences.featureKeys || [];
    const status = openingStatus(pub, date);
    const busy = estimateBusy(pub, date, preferences);

    if (preferences.openNow && !status.openNow) return false;
    if (preferences.notBusy && busy.key === "likely_busy") return false;
    if (preferences.minRating && pub.googleRating < preferences.minRating) return false;
    if (preferences.maxPintPrice && pub.estimatedPintPrice > preferences.maxPintPrice) return false;

    if (includeFeatureFilters) {
      return selectedFeatureKeys.every((key) => pub.features[key]);
    }

    return true;
  }

  function calculateRecommendation(pub, people, preferences, targetPoint, date) {
    const travel = scoreTravel(people, pub, targetPoint);
    const status = openingStatus(pub, date);
    const busy = estimateBusy(pub, date, preferences);
    const preference = scorePreferences(pub, preferences.featureKeys || []);
    const ratingScore = scoreRating(pub);
    const openingScore = scoreOpening(status);

    const totalScore = Math.round(
      travel.travelScore * 0.35 +
        preference.preferenceScore * 0.25 +
        ratingScore * 0.2 +
        openingScore * 0.1 +
        busy.score * 0.1
    );

    const result = {
      pub,
      totalScore,
      travelScore: travel.travelScore,
      preferenceScore: preference.preferenceScore,
      ratingScore,
      openingScore,
      busynessScore: busy.score,
      openingStatus: status,
      busyness: busy,
      averageTravelTimeMinutes: travel.averageTravelTimeMinutes,
      maxTravelTimeMinutes: travel.maxTravelTimeMinutes,
      spreadMinutes: travel.spreadMinutes,
      midpointDistanceKm: travel.midpointDistanceKm,
      travelTimes: travel.travelTimes,
      matchedPreferences: preference.matchedPreferences,
      missingPreferences: preference.missingPreferences
    };

    result.explanation = buildExplanation(result, pub, preferences.featureKeys || [], status, busy);
    return result;
  }

  function sortRecommendations(results, sortBy) {
    const sorted = results.slice();
    sorted.sort((a, b) => {
      if (sortBy === "travel") return a.averageTravelTimeMinutes - b.averageTravelTimeMinutes;
      if (sortBy === "rating") return b.pub.googleRating - a.pub.googleRating || b.pub.reviewCount - a.pub.reviewCount;
      if (sortBy === "busy") return b.busynessScore - a.busynessScore || b.totalScore - a.totalScore;
      if (sortBy === "price") return a.pub.estimatedPintPrice - b.pub.estimatedPintPrice || b.totalScore - a.totalScore;
      return b.totalScore - a.totalScore;
    });
    return sorted;
  }

  function calculateRecommendations({ people, pubs, preferences, date = new Date(), options = {}, sortBy = "best" }) {
    const target = getTargetPoint(people, options);
    const targetPoint = target.point;
    const nearestArea = findNearestArea(targetPoint);
    const selectedFeatureKeys = preferences.featureKeys || [];

    let relaxedFilters = false;
    let candidates = pubs.filter((pub) =>
      passesBaseFilters(pub, preferences, date, selectedFeatureKeys.length > 0)
    );

    if (!candidates.length && selectedFeatureKeys.length) {
      candidates = pubs.filter((pub) => passesBaseFilters(pub, preferences, date, false));
      relaxedFilters = candidates.length > 0;
    }

    const results = sortRecommendations(
      candidates.map((pub) => calculateRecommendation(pub, people, preferences, targetPoint, date)),
      sortBy
    );

    return {
      targetPoint,
      targetLabel: target.label,
      targetBasis: target.basis,
      nearestArea,
      relaxedFilters,
      results
    };
  }

  window.LPF_SCORING = {
    calculateCentroid,
    calculateRecommendations,
    estimateBusy,
    estimateTravelTime,
    featureLabels,
    findNearestArea,
    fullWeekHours,
    getLocationSuggestions,
    haversineKm,
    openingStatus,
    resolveLocation,
    sortRecommendations
  };
})();
