import assert from "node:assert/strict";
import { test } from "node:test";
import { izCoz, izGuncelMi, seferSec } from "./iz.ts";

test("hedefine inmis en son sefer secilir", () => {
  const s = seferSec([
    { fr24_id: "a", flight_ended: true, datetime_landed: "2026-11-01T10:00:00", dest_icao_actual: "EGLL" },
    { fr24_id: "b", flight_ended: true, datetime_landed: "2026-11-02T10:00:00", dest_icao_actual: "EGLL" },
    { fr24_id: "c", flight_ended: true, datetime_landed: "2026-11-02T12:00:00", dest_icao_actual: "EGKK" },
    { fr24_id: "d", flight_ended: false, datetime_landed: null },
  ], "EGLL");
  assert.equal(s?.fr24_id, "b");
  assert.equal(seferSec([], "EGLL"), null);
});

test("gecmis tarihli soruda bugunun izi kullanilmaz", () => {
  const simdi = Date.parse("2026-11-03T12:00:00Z");
  assert.equal(izGuncelMi("", simdi), true);
  assert.equal(izGuncelMi("2026-11-02", simdi), true);
  assert.equal(izGuncelMi("2025-06-20", simdi), false);
});

test("iz lon lat sirasina cevrilir, seyreltilir, son nokta korunur", () => {
  const tracks = Array.from({ length: 1001 }, (_, i) => ({ lat: i, lon: -i }));
  const n = izCoz([{ fr24_id: "a", tracks }]);
  assert.ok(n.length <= 201);
  assert.deepEqual(n[0], [-0, 0]);
  assert.deepEqual(n.at(-1), [-1000, 1000]);
  assert.equal(izCoz({ data: [{ tracks }] }).length, n.length);
  assert.deepEqual(izCoz([]), []);
});
