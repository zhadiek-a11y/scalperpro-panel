/* kalkulator.js — salinan PERSIS rumus hitung_rencana() di scalperpro_core.py.
   Dipakai Mini App untuk pratinjau. Keputusan akhir tetap dihitung ulang oleh bot di PC rumah. */
(function (root) {
  function bulat(x, d) { const f = Math.pow(10, d); return Math.round(x * f) / f; }
  function turun(x, step) { return Math.floor(x / step + 1e-9) * step; }
  function parseMult(mult, layers) {
    let m = String(mult || "").replace(/;/g, ",").split(",").map(s => s.trim()).filter(s => s !== "").map(Number);
    if (!m.length || m.some(isNaN)) m = m.filter(v => !isNaN(v));
    if (!m.length) m = [1];
    while (m.length < layers) m.push(m[m.length - 1]);
    return m.slice(0, layers);
  }
  function hitung(o) {
    const side = String(o.side).toUpperCase(), layers = parseInt(o.layers, 10), mode = String(o.mode || "FIXED").toUpperCase();
    const c = { vol_min: 0.01, vol_step: 0.01, vol_max: 100, nilai_per_unit: 100, saldo: 0, digits: 2, jarak_min: 0, ...o };
    const p = { side, entry: +o.entry, batas: +o.batas, cut_loss: +o.cut_loss, stoploss: +o.stoploss, tp: +o.tp,
      layers, mode, lot_dasar: +(o.lot_dasar || 0), risk_pct: +(o.risk_pct || 0), saldo: +c.saldo,
      harga: [], lot: [], total_lot: 0, rata_entry: 0, rugi_cl: 0, rugi_sl: 0, untung_tp: 0, untung_tp_l1: 0,
      galat: [], peringatan: [] };
    const g = p.galat, w = p.peringatan;
    for (const k of ["entry", "batas", "cut_loss", "stoploss", "tp"]) if (!isFinite(p[k]) || p[k] <= 0) { g.push("Kolom harga belum lengkap"); return p; }
    if (!(layers >= 1 && layers <= 20)) { g.push("Jumlah layer harus 1–20"); return p; }
    p.mult = parseMult(o.mult, layers);
    if (side === "BUY") {
      if (!(p.batas <= p.entry)) g.push("Floor harus ≤ Entry");
      if (!(p.cut_loss < p.batas)) g.push("Cut Loss harus di BAWAH Floor");
      if (!(p.stoploss < p.cut_loss)) g.push("Stoploss harus di BAWAH Cut Loss");
      if (!(p.tp > p.entry)) g.push("TP harus di ATAS Entry");
    } else if (side === "SELL") {
      if (!(p.batas >= p.entry)) g.push("Ceiling harus ≥ Entry");
      if (!(p.cut_loss > p.batas)) g.push("Cut Loss harus di ATAS Ceiling");
      if (!(p.stoploss > p.cut_loss)) g.push("Stoploss harus di ATAS Cut Loss");
      if (!(p.tp < p.entry)) g.push("TP harus di BAWAH Entry");
    } else g.push("Arah harus BUY atau SELL");
    if (g.length) return p;
    if (layers === 1) p.harga = [bulat(p.entry, c.digits)];
    else { const st = (p.batas - p.entry) / (layers - 1); for (let k = 0; k < layers; k++) p.harga.push(bulat(p.entry + st * k, c.digits)); }
    const sgn = side === "BUY" ? 1 : -1, npu = +c.nilai_per_unit;
    const jsl = p.harga.map(h => Math.abs(h - p.stoploss));
    if (mode === "RISK") {
      if (p.saldo <= 0) { g.push("Mode RISK butuh saldo akun"); return p; }
      if (p.risk_pct <= 0) { g.push("Risk % harus > 0"); return p; }
      const target = p.saldo * p.risk_pct / 100, perLot = p.mult.reduce((a, m, i) => a + m * jsl[i], 0) * npu;
      p.lot_dasar = perLot > 0 ? turun(target / perLot, c.vol_step) : 0;
      if (p.lot_dasar < c.vol_min) { g.push(`Risk ${p.risk_pct}% terlalu kecil: lot dasar hasil hitung < ${c.vol_min} (butuh ≥ $${(c.vol_min * perLot).toFixed(0)} risiko)`); return p; }
    } else if (p.lot_dasar < c.vol_min) { g.push(`Lot dasar minimal ${c.vol_min}`); return p; }
    p.lot = p.mult.map(m => bulat(turun(p.lot_dasar * m, c.vol_step), 2));
    if (p.lot.some(x => x < c.vol_min)) g.push(`Ada layer dengan lot < ${c.vol_min} (cek multiplier)`);
    if (p.lot.some(x => x > c.vol_max)) g.push(`Ada layer dengan lot > maksimum broker ${c.vol_max}`);
    p.total_lot = bulat(p.lot.reduce((a, b) => a + b, 0), 2);
    if (c.batas_lot_total && p.total_lot > +c.batas_lot_total) g.push(`Total lot ${p.total_lot} melebihi batas pengaman ${c.batas_lot_total}`);
    const sum = f => p.harga.reduce((a, h, i) => a + f(h) * p.lot[i], 0);
    p.rata_entry = p.total_lot ? bulat(sum(h => h) / p.total_lot, 2) : 0;
    p.rugi_cl = bulat(-sum(h => Math.abs(h - p.cut_loss)) * npu, 2);
    p.rugi_sl = bulat(-sum(h => Math.abs(h - p.stoploss)) * npu, 2);
    p.untung_tp = bulat(sum(h => Math.abs(p.tp - h)) * npu, 2);
    p.untung_tp_l1 = bulat(Math.abs(p.tp - p.harga[0]) * p.lot[0] * npu, 2);
    const jm = +c.jarak_min, bid = c.bid === "" || c.bid == null ? null : +c.bid, ask = c.ask === "" || c.ask == null ? null : +c.ask;
    if (side === "BUY" && ask != null && p.harga[0] >= ask) g.push(`Entry ${p.harga[0]} ≥ harga ask ${ask.toFixed(2)}: BUY LIMIT harus di bawah harga sekarang`);
    if (side === "SELL" && bid != null && p.harga[0] <= bid) g.push(`Entry ${p.harga[0]} ≤ harga bid ${bid.toFixed(2)}: SELL LIMIT harus di atas harga sekarang`);
    if (jm > 0) {
      const dtp = Math.min(...p.harga.map(h => Math.abs(p.tp - h))), dsl = Math.min(...p.harga.map(h => Math.abs(p.stoploss - h)));
      if (dtp < jm) g.push(`TP terlalu dekat dengan layer (${dtp.toFixed(2)} < jarak minimum broker ${jm.toFixed(2)})`);
      if (dsl < jm) g.push(`Stoploss terlalu dekat dengan layer (${dsl.toFixed(2)} < jarak minimum broker ${jm.toFixed(2)})`);
      if (side === "BUY" && ask != null && ask - p.harga[0] > 0 && ask - p.harga[0] < jm) g.push(`Entry terlalu dekat harga ask (< ${jm.toFixed(2)})`);
      if (side === "SELL" && bid != null && p.harga[0] - bid > 0 && p.harga[0] - bid < jm) g.push(`Entry terlalu dekat harga bid (< ${jm.toFixed(2)})`);
    }
    if (bid != null && ask != null) {
      if (side === "BUY" && bid <= p.cut_loss) g.push("Harga sekarang sudah di bawah Cut Loss");
      if (side === "SELL" && ask >= p.cut_loss) g.push("Harga sekarang sudah di atas Cut Loss");
    }
    if (p.saldo > 0) {
      if (-p.rugi_sl > p.saldo) w.push(`RUGI BILA KENA STOPLOSS $${Math.round(-p.rugi_sl).toLocaleString("en-US")} MELEBIHI SALDO $${Math.round(p.saldo).toLocaleString("en-US")}`);
      else if (-p.rugi_sl > 0.2 * p.saldo) w.push(`Rugi bila kena Stoploss = ${Math.round(-p.rugi_sl / p.saldo * 100)}% saldo`);
    }
    if (sgn * (p.tp - p.rata_entry) <= 0) w.push("TP tidak melewati rata-rata entry semua layer: bila semua terisi, TP = rugi");
    return p;
  }
  root.hitungRencana = hitung;
  if (typeof module !== "undefined") module.exports = { hitung };
})(typeof window !== "undefined" ? window : globalThis);
