import test from "node:test";
import assert from "node:assert/strict";
import { searchKurdSubMovies } from "./kurdSubMovieSearch";

const movies = [
  { id: "1", title: "Scarface | کوردی" },
  { id: "2", title: "Moana (2026)" },
  { id: "3", title: "فیلمی کوردی" },
];

test("searches English movie titles regardless of case or word spacing", () => {
  assert.deepEqual(searchKurdSubMovies(movies, "SCAR face").map((movie) => movie.id), ["1"]);
  assert.deepEqual(searchKurdSubMovies(movies, "moana").map((movie) => movie.id), ["2"]);
});

test("searches Kurdish titles across common Arabic letter variants", () => {
  assert.deepEqual(searchKurdSubMovies(movies, "كوردي").map((movie) => movie.id), ["1", "3"]);
});

test("limits the open list without dropping matches for a later query", () => {
  assert.equal(searchKurdSubMovies(movies, "", 2).length, 2);
  assert.deepEqual(searchKurdSubMovies(movies, "فیلم").map((movie) => movie.id), ["3"]);
});
