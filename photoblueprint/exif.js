/* Photo Blueprint EXIF reader: pulls the camera's own notes out of a JPEG (make, model, lens, exposure, focal length,
   date, GPS position and the direction the camera pointed). Only the tags a shot sheet uses. Pure, no dependencies.
   Loaded in the page as window.SPExif and in Node (tests) with require(). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SPExif = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const TAGS = {
    0x010f: "Make", 0x0110: "Model", 0x0112: "Orientation", 0x0132: "DateTime", 0x013b: "Artist", 0x8298: "Copyright",
    0x8769: "ExifIFD", 0x8825: "GPSIFD",
    0x829a: "ExposureTime", 0x829d: "FNumber", 0x8827: "ISOSpeedRatings", 0x9003: "DateTimeOriginal", 0x9201: "ShutterSpeedValue", 0x9202: "ApertureValue",
    0x9204: "ExposureBiasValue", 0x9209: "Flash", 0x920a: "FocalLength", 0xa405: "FocalLengthIn35mmFilm", 0xa432: "LensSpecification", 0xa433: "LensMake", 0xa434: "LensModel",
    0xa002: "PixelXDimension", 0xa003: "PixelYDimension"
  };
  const GPS = { 0x0001: "GPSLatitudeRef", 0x0002: "GPSLatitude", 0x0003: "GPSLongitudeRef", 0x0004: "GPSLongitude", 0x0005: "GPSAltitudeRef", 0x0006: "GPSAltitude", 0x0010: "GPSImgDirectionRef", 0x0011: "GPSImgDirection" };
  const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

  // Finds the Exif APP1 segment in a JPEG and returns the TIFF block (offset into the buffer) or -1.
  function findTiff(dv) {
    if (dv.byteLength < 4 || dv.getUint16(0) !== 0xffd8) return -1;
    let p = 2;
    while (p + 4 <= dv.byteLength) {
      if (dv.getUint8(p) !== 0xff) return -1;
      const marker = dv.getUint8(p + 1);
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) { p += marker === 0xff ? 1 : 2; continue; }
      if (marker === 0xda || marker === 0xd9) return -1; // image data starts: no Exif before it
      const len = dv.getUint16(p + 2);
      if (marker === 0xe1 && p + 10 <= dv.byteLength && dv.getUint32(p + 4) === 0x45786966 && dv.getUint16(p + 8) === 0) return p + 10;
      p += 2 + len;
    }
    return -1;
  }

  function readValue(dv, t, type, count, valueOff, le, name) {
    const size = SIZES[type]; if (!size) return undefined;
    const total = size * count;
    let off = total <= 4 ? valueOff : t + dv.getUint32(valueOff, le);
    if (off + total > dv.byteLength) return undefined;
    if (type === 2) { // ASCII
      let s = ""; for (let i = 0; i < count; i++) { const c = dv.getUint8(off + i); if (c === 0) break; s += String.fromCharCode(c); }
      return s.trim();
    }
    const out = [];
    for (let i = 0; i < count; i++) {
      const o = off + i * size;
      switch (type) {
        case 1: case 7: out.push(dv.getUint8(o)); break;
        case 3: out.push(dv.getUint16(o, le)); break;
        case 4: out.push(dv.getUint32(o, le)); break;
        case 9: out.push(dv.getInt32(o, le)); break;
        case 5: { const n = dv.getUint32(o, le), d = dv.getUint32(o + 4, le); out.push(d ? n / d : 0); break; }
        case 10: { const n = dv.getInt32(o, le), d = dv.getInt32(o + 4, le); out.push(d ? n / d : 0); break; }
      }
    }
    if (type === 7 && name !== "LensSpecification") return undefined; // undefined bytes we don't use
    return count === 1 ? out[0] : out;
  }

  function readIfd(dv, t, ifdOff, le, names, out) {
    if (ifdOff + 2 > dv.byteLength) return;
    const n = dv.getUint16(ifdOff, le);
    for (let i = 0; i < n; i++) {
      const e = ifdOff + 2 + i * 12; if (e + 12 > dv.byteLength) return;
      const tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), count = dv.getUint32(e + 4, le);
      const name = names[tag]; if (!name) continue;
      const v = readValue(dv, t, type, count, e + 8, le, name);
      if (v !== undefined) out[name] = v;
    }
  }

  /* Reads the tags from a JPEG's bytes (ArrayBuffer or Uint8Array). Returns null when there is no Exif block.
     Never throws on a damaged file: whatever could be read comes back. */
  function parse(buf) {
    try {
      const dv = buf instanceof DataView ? buf : new DataView(buf.buffer ? buf.buffer : buf, buf.byteOffset || 0, buf.byteLength);
      const t = findTiff(dv); if (t < 0 || t + 8 > dv.byteLength) return null;
      const bo = dv.getUint16(t); const le = bo === 0x4949; if (!le && bo !== 0x4d4d) return null;
      if (dv.getUint16(t + 2, le) !== 42) return null;
      const out = {};
      readIfd(dv, t, t + dv.getUint32(t + 4, le), le, TAGS, out);
      if (out.ExifIFD != null) { readIfd(dv, t, t + out.ExifIFD, le, TAGS, out); delete out.ExifIFD; }
      if (out.GPSIFD != null) { readIfd(dv, t, t + out.GPSIFD, le, GPS, out); delete out.GPSIFD; }
      if (Array.isArray(out.ISOSpeedRatings)) out.ISOSpeedRatings = out.ISOSpeedRatings[0];
      if (out.GPSAltitude != null && out.GPSAltitudeRef === 1) out.GPSAltitude = -out.GPSAltitude;
      return out;
    } catch (e) { return null; }
  }

  /* Reads a File or Blob (only the first 256 KB, which is where Exif lives). Resolves to the tag table or null. */
  function read(file) {
    return new Promise(res => {
      try {
        const slice = file.slice(0, 262144);
        const fr = new FileReader();
        fr.onload = () => res(parse(fr.result)); fr.onerror = () => res(null);
        fr.readAsArrayBuffer(slice);
      } catch (e) { res(null); }
    });
  }
  return { parse, read, TAGS, GPS };
});
