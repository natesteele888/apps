/* Read 20: the line icons used by the older readers' look (the early readers keep their emoji).
   Each icon is drawn in a 24 by 24 box with the current text color, so the theme can color them. */
(function (root) {
  "use strict";
  const P = {
    logo: '<path d="M2.5 5.5C5.5 4 8.8 4 12 6c3.2-2 6.5-2 9.5-.5V19c-3-1.5-6.3-1.5-9.5.5-3.2-2-6.5-2-9.5-.5z"/><path d="M12 6v13.5"/>',
    books: '<rect x="3.5" y="4" width="4" height="16" rx="1"/><rect x="9.5" y="4" width="4" height="16" rx="1"/><path d="M16 5.6l3.8-1 3 14.4-3.8 1z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    back: '<path d="M15 5l-7 7 7 7"/>', next: '<path d="M9 5l7 7-7 7"/>',
    pause: '<path d="M8.5 5v14M15.5 5v14"/>', play: '<path d="M8 5l11 7-11 7z"/>',
    flame: '<path d="M12 3c1 3.6 5 5.6 5 10a5 5 0 0 1-10 0c0-2 1-3.3 2-4.3.2 1.4.8 2.2 1.6 2.6C10.5 8.5 11 5.5 12 3z"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    done: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.8 2.8 5.4-5.6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    volume: '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    cloud: '<path d="M7 18a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 9.5 4.3 4.3 0 0 1 17.5 18z"/>',
    // topics
    sports: '<circle cx="12" cy="12" r="8.5"/><path d="M3.8 9.5c3 .5 5.5 2.7 6.3 5.8M20.2 14.5c-3-.5-5.5-2.7-6.3-5.8M12 3.5c1.5 2.7 1.5 14.3 0 17"/>',
    photo: '<path d="M4 8.5h3l1.5-2.5h7L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.3" r="3.6"/>',
    fitness: '<path d="M3.5 9.5v5M6.5 7.5v9M17.5 7.5v9M20.5 9.5v5M6.5 12h11"/>',
    athletes: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5c0 3 1.5 4.5 3.5 4.7M16 6h3.5c0 3-1.5 4.5-3.5 4.7M12 13v4M8.5 20h7M9.5 17h5"/>',
    social: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"/>',
    english: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/>'
  };
  /* The picture for one icon. fill: true for solid shapes. */
  root.R20Icons = (name, size) => {
    const body = P[name]; if (!body) return "";
    const solid = name === "play" ? ' fill="currentColor"' : ' fill="none"';
    return '<svg class="ic ic-' + name + '" viewBox="0 0 24 24" width="' + (size || 22) + '" height="' + (size || 22) + '"' + solid + ' stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + "</svg>";
  };
  root.R20Icons.has = n => !!P[n];
  if (typeof module !== "undefined" && module.exports) module.exports = root.R20Icons;
})(typeof window !== "undefined" ? window : globalThis);
