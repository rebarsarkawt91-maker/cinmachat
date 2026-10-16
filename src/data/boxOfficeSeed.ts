export interface BoxOfficeMovie {
  rank: number; title: string; weekendGross: string; poster: string;
  year: number | null; imdbId?: string;
}
export interface BoxOfficeChart {
  items: BoxOfficeMovie[]; period: string; fetchedAt: string;
  source: 'Box Office Mojo'; stale: boolean;
}

// Last verified official Weekend Top 5 feed. This dated snapshot keeps the
// informational strip useful offline; it is never presented as a live refresh.
export const boxOfficeSeed: BoxOfficeChart = {
  source: 'Box Office Mojo', period: 'Oct 9–11', fetchedAt: '2026-10-16T19:31:58Z', stale: true,
  items: [
    { rank: 1, title: 'Other Mommy', weekendGross: '$27.8 M', year: 2026, imdbId: 'tt36586020', poster: 'https://m.media-amazon.com/images/M/MV5BOGUyODYyYTctMmY0Mi00ZWIwLThjYWItZDJmODY4NGU1YjY1XkEyXkFqcGc@._V1_QL75_UX240_.jpg' },
    { rank: 2, title: 'Verity', weekendGross: '$12.0 M', year: 2026, imdbId: 'tt32261958', poster: 'https://m.media-amazon.com/images/M/MV5BZmE0OWRiNzktY2MwMy00YzQ5LWFkMzctNjI1ZWQ1NTRiZGM3XkEyXkFqcGc@._V1_QL75_UX240_.jpg' },
    { rank: 3, title: 'Resident Evil', weekendGross: '$8.6 M', year: 2026, imdbId: 'tt35538033', poster: 'https://m.media-amazon.com/images/M/MV5BOGZjZWI1NTItOGUwZC00YWZkLWIxZWEtNzE2ZTIxODdjNmZmXkEyXkFqcGc@._V1_QL75_UX240_.jpg' },
    { rank: 4, title: 'Heart of the Beast', weekendGross: '$7.4 M', year: 2026, imdbId: 'tt7526136', poster: 'https://m.media-amazon.com/images/M/MV5BMDVlMTRhMjgtMjdmZi00NjJhLWExMmYtODExNWJkZGZjNjdhXkEyXkFqcGc@._V1_QL75_UX240_.jpg' },
    { rank: 5, title: 'The Social Reckoning', weekendGross: '$5.0 M', year: 2026, imdbId: 'tt37510326', poster: 'https://m.media-amazon.com/images/M/MV5BYjdlZTgzZDUtMmVjYy00M2EyLWFlNGMtNjVhYjM2ODNmZjEzXkEyXkFqcGc@._V1_QL75_UX240_.jpg' },
  ],
};
