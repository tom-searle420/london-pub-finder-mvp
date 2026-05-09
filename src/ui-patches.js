(function () {
  function initials(name) {
    return String(name || "Pub").replace(/^the\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  }

  function patchCard(card) {
    if (card.querySelector(".pub-photo-slot")) return;
    const title = card.querySelector("h3")?.textContent || "Pub";
    const rank = card.querySelector(".rank");
    if (!rank) return;

    const photo = document.createElement("div");
    photo.className = "pub-photo-slot";
    photo.setAttribute("aria-label", `Photo space for ${title}`);
    photo.innerHTML = `<div class="pub-photo-placeholder"><span>${initials(title)}</span><small>Pub photo</small></div>`;
    rank.insertAdjacentElement("afterend", photo);

    const score = card.querySelector(".score-badge");
    if (score && !score.querySelector("strong")) {
      score.innerHTML = `<strong>${score.textContent.trim()}%</strong><span>match</span>`;
    }
  }

  function patchCards() {
    document.querySelectorAll(".pub-card").forEach(patchCard);
  }

  const observer = new MutationObserver(patchCards);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("DOMContentLoaded", patchCards);
  patchCards();
})();
