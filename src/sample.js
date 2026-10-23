// Juno Park's sample notebook. Fictional person; every line is written by us.
// `map` pins a mention to a Qloo entity ID so the sample resolves the same way every time.
// Mentions left unmapped go through live recognition (some land in the inbox on purpose).
const ITML = "900B6C69-9D86-4153-B8FD-4D6CD726FCF8";
const KLARA = "504A59EF-54E1-4911-8015-8FA64FC6AA8C";
const PHOEBE = "AFBC71A7-9439-4AB0-AB68-D14B11AAF836";
const PAST = "9A62B37E-9A6D-47DA-A6FD-9414FA7F7710";
const BIGTHIEF = "AD420A3F-5F09-4C1C-BB1E-A3DEB937F184";
const PATERSON = "C54D1066-C568-4866-96FA-6115111D245D";
const FRANCES = "EFD8B201-CC97-462C-AFE2-5CC6352239E6";
const FALLEN = "6516B401-9073-4576-B6C4-82DEF03DDCCD";
const NORWOOD = "AB5E9CA9-E7A4-4D68-A641-FE2276C1C103";
const LENKER = "F919E809-3234-4251-B031-5327E609AD82";
const NUJABES = "E11125AF-936B-4935-B607-F2DA2E6A6B92";

export const SAMPLE_NOTES = [
  { daysAgo: 0, minutes: 30, text: "rewatched In the Mood for Love. the corridor, the score, every time.", map: { "In the Mood for Love": ITML } },
  { daysAgo: 1, minutes: 600, text: "standup ran long again" },
  { daysAgo: 2, minutes: 680, text: "G train, Phoebe Bridgers on shuffle and the whole car went quiet in my head", map: { "Phoebe Bridgers": PHOEBE } },
  { daysAgo: 2, minutes: 200, text: "lunch at the counter place, finally started Klara and the Sun", map: { "Klara and the Sun": KLARA } },
  { daysAgo: 5, text: "watched Her again on the plane, still a lot" },
  { daysAgo: 3, minutes: 1300, text: "finally watched Solaris. the long drive into the city, I didn't want it to end" },
  { daysAgo: 6, text: "someone left The Rings of Saturn on the bench outside the library. took it as a sign." },
  { daysAgo: 9, text: "Big Thief live recording, Not, at full volume while cleaning. best twenty minutes of the week", map: { "Big Thief": BIGTHIEF } },
  { daysAgo: 13, text: "Paterson on a rainy Sunday. small poems, bus routes, a dog. I want my life to be this size.", map: { "Paterson": PATERSON } },
  { daysAgo: 20, text: "Klara is slow in the best way. the sun as a god. underlined half a page.", map: { "Klara": KLARA } },
  { daysAgo: 27, text: "Adrianne Lenker, anything, songs that sound like a kitchen at 7am", map: { "Adrianne Lenker": LENKER } },
  { daysAgo: 41, text: "Past Lives again with Mina. we both cried at the bar scene, different reasons", map: { "Past Lives": PAST } },
  { daysAgo: 58, text: "Fallen Angels, neon and noise. Wong Kar-wai is my weather.", map: { "Fallen Angels": FALLEN } },
  { daysAgo: 64, text: "In the Mood for Love was too slow tonight, couldn't settle", map: { "In the Mood for Love": ITML } },
  { daysAgo: 90, text: "Frances Ha: running down the street to Modern Love. that's the whole review.", map: { "Frances Ha": FRANCES } },
  { daysAgo: 120, text: "reading Norwegian Wood on the ferry, wrote down the line about the well", map: { "Norwegian Wood": NORWOOD } },
  { daysAgo: 150, text: "Nujabes while writing, again. it makes the cursor feel kind", map: { "Nujabes": NUJABES } },
  { daysAgo: 210, text: "In the Mood for Love first time, restrained and devastating.", map: { "In the Mood for Love": ITML } },
  { daysAgo: 230, text: "Big Thief, Masterpiece, on repeat walking home over the Pulaski Bridge", map: { "Big Thief": BIGTHIEF } },
  { daysAgo: 4, minutes: 900, text: "the Wong one with the noodles and the neon, borrowed the DVD from Marcus" },
  { daysAgo: 7, minutes: 400, text: "Heard Sunday on the radio at the laundromat. no idea who, wrote down the hook" },
];
