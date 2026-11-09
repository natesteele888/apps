/* Photo Blueprint figures: the seven stance drawings (standing, kneeling, laying down, crouching, sitting, tripod,
   monopod). They are the original hand-drawn blueprint figures, cropped from the reference sheet and keyed to a
   transparent mask (figures/*.png), so the page paints them in whatever ink the theme uses: white on blueprint, blue
   on paper. Loaded as window.SPFigures and in Node (tests) with require(). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SPFigures = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  // file: the mask image; w/h: its pixel size; cam: where the lens sits, as a fraction of the drawing's height from the top.
  const FIG = {
    standing: { file: "standing", w: 340, h: 410, cam: 0.109, label: "Standing" },
    kneeling: { file: "kneeling", w: 336, h: 320, cam: 0.119, label: "Kneeling" },
    prone: { file: "laying-down", w: 531, h: 152, cam: 0.167, label: "Laying down" },
    crouching: { file: "crouching", w: 331, h: 260, cam: 0.129, label: "Crouching" },
    sitting: { file: "sitting", w: 350, h: 262, cam: 0.128, label: "Sitting" },
    tripod: { file: "tripod", w: 288, h: 346, cam: 0.07, label: "Tripod (static)" },
    monopod: { file: "monopod", w: 328, h: 390, cam: 0.111, label: "Monopod" }
  };
  const names = Object.keys(FIG);
  const get = pose => FIG[pose] || FIG.standing;
  const label = pose => get(pose).label;
  /* Markup for a stance drawing in a square box: the drawing sits on the box's bottom edge (its ground line), fitted inside.
     svg(pose, {size, class}) keeps its old name; it returns a masked <span>, not an <svg>. */
  function svg(pose, o) {
    const f = get(pose), opt = o || {};
    const size = opt.size ? `;width:${opt.size}px;height:${opt.size}px` : "";
    return `<span class="figimg${opt.class ? " " + opt.class : ""}" role="img" aria-label="${f.label}" style="--fig:url(figures/${f.file}.png)${size}"></span>`;
  }
  /* Where the lens is, in the 0–120 box used by the height dimension line (ground at 120, drawing fitted and bottom-aligned). */
  function cameraY(pose) {
    const f = get(pose), drawnH = 120 * Math.min(1, f.h / f.w);
    return Math.round((120 - drawnH + f.cam * drawnH) * 10) / 10;
  }
  return { svg, names, label, cameraY, FIG };
});
