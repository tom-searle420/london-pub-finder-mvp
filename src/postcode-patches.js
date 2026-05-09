(function () {
  const scoring = window.LPF_SCORING;
  const data = window.LPF_DATA;
  if (!scoring || !data) return;

  const postcodeMap = {
    E1: "Shoreditch", E2: "Shoreditch", E3: "Hackney", E5: "Hackney", E8: "Hackney", E9: "Hackney",
    E10: "Walthamstow", E11: "Stratford", E14: "Canary Wharf", E15: "Stratford", E17: "Walthamstow",
    EC1: "Farringdon", EC2: "Shoreditch", EC3: "London Bridge", EC4: "Waterloo",
    N1: "Angel", N4: "Finsbury Park", N5: "Finsbury Park", N7: "King's Cross", N8: "Finsbury Park",
    N15: "Seven Sisters", N16: "Stoke Newington", N17: "Tottenham Hale", N19: "Finsbury Park",
    NW1: "Camden", NW3: "Camden", NW5: "Camden", NW6: "Paddington", NW8: "Paddington",
    SE1: "London Bridge", SE5: "Peckham", SE8: "Deptford", SE10: "Greenwich", SE11: "Vauxhall",
    SE13: "Lewisham", SE15: "Peckham", SE16: "London Bridge", SE22: "Peckham",
    SW1: "Victoria", SW2: "Brixton", SW4: "Clapham", SW6: "Putney", SW8: "Vauxhall",
    SW9: "Brixton", SW11: "Battersea", SW12: "Balham", SW15: "Putney", SW17: "Tooting",
    SW18: "Putney", SW19: "Wimbledon", W1: "Soho", W2: "Paddington", W5: "Ealing Broadway",
    W6: "Hammersmith", W8: "Paddington", W11: "Paddington", W12: "Hammersmith",
    WC1: "King's Cross", WC2: "Soho", TW9: "Richmond", TW10: "Richmond"
  };

  function outwardCode(input) {
    const compact = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return compact.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)(\d[A-Z]{2})?$/)?.[1] || null;
  }

  function resolvePostcode(input) {
    const outward = outwardCode(input);
    if (!outward) return null;
    const sectorless = outward.match(/^([A-Z]{1,2}\d{1,2})/)?.[1];
    const name = postcodeMap[outward] || postcodeMap[sectorless];
    const preset = data.LOCATION_PRESETS.find((location) => location.name === name);
    return preset ? { ...preset, source: "postcode", postcodePrefix: outward } : null;
  }

  const originalResolve = scoring.resolveLocation;
  scoring.resolveLocation = (input) => resolvePostcode(input) || originalResolve(input);

  const originalSuggestions = scoring.getLocationSuggestions;
  scoring.getLocationSuggestions = () =>
    originalSuggestions().concat(["E17 7QX", "SW4 0AA", "NW1 8QL", "N1 9GU", "SE1 9SP", "W1D 3QF"]).sort();
})();
