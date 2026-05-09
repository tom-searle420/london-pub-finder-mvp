(function () {
  const data = window.LPF_DATA;
  if (!data?.LOCATION_PRESETS) return;

  const hasFarringdon = data.LOCATION_PRESETS.some((location) => location.name === "Farringdon");
  if (hasFarringdon) return;

  data.LOCATION_PRESETS.splice(7, 0, {
    name: "Farringdon",
    area: "Farringdon",
    lat: 51.5202,
    lng: -0.1053,
    transitScore: 10,
    aliases: ["farringdon", "clerkenwell", "ec1"]
  });
})();
