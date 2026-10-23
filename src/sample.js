// Juno Park's sample notebook. Fictional person (Greenpoint, Brooklyn); every line is written by us.
// `map` pins a mention to a Qloo entity ID so the sample resolves the same way every time, with no model call.
// `ask` puts a real ambiguity in the Inbox: the guesses are fixed Qloo IDs, ranked live by Qloo against Juno's cards.
// `fk` (footprint kind) / `sentiment` describe the footprint (defaults: note / positive).
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
const HER = "4F8EBD51-46DB-4527-BC61-75B56472A50E";
const RINGS = "F6EE56CB-6670-4D88-A90C-5139D7D43900";
const CHUNGKING = "D8D8F8A2-F1EC-494C-A384-302A90E6FEFA";
const FILMFORUM = "0F920838-D245-440D-B52E-2C045BEEFEE9";
const JBREAKFAST = "AA21934D-3A6E-4973-983F-28604C44E3AC";
const BKSTEEL = "40D3CED6-20A6-4285-97E0-9C8EEA1EC467";
const HMART = "ACF58292-0020-4119-8076-C2E459522CF6";
const AFTERSUN = "8481AF5B-82DF-42B7-9900-371EAFBA56FB";
const MCNALLY = "3F1DB201-E892-4D16-BDAC-383807ACABA4";
const PACHINKO = "CD40CE47-82E8-4745-9BEA-90EB8EB9F0FB";
const MITSKI = "E3BD2650-8E5C-43FB-B5A7-C1C7753A6293";
const PERFECT = "B30DB61E-707C-421E-A1C4-1A912B7F067D";
const METROGRAPH = "B5C0F1E6-12D7-49FD-88C4-696817DD9405";
// inbox candidates
const SOLARIS_72 = "D2243411-C04C-4134-88C6-578B3F0A6116", SOLARIS_02 = "2F29B188-96D7-4324-B8DF-C313325C433C", SOLARIS_68 = "352B4E48-9795-4BB0-91A2-4BE07A034C12";
const NP_BOOK = "28D688C4-0760-4042-BEC1-F6EE75E71CC7", NP_TV = "19DF9974-2931-42F7-AF6F-DC29B9E17974";
const LW_2019 = "969911E8-7092-43D9-8C7D-C7547EAE3C00", LW_1994 = "A4927590-6C9B-4403-8BA9-DC6050AAE28F";

export const SAMPLE_NOTES = [
  { daysAgo: 0, minutes: 30, text: "rewatched In the Mood for Love. the corridor, the score, every time.", map: { "In the Mood for Love": ITML }, fk: "rewatch" },
  { daysAgo: 1, minutes: 600, text: "standup ran long again" },
  { daysAgo: 1, minutes: 120, text: "Mitski at 1am again. Be the Cowboy front to back, lights off", map: { "Mitski": MITSKI }, fk: "listen" },
  { daysAgo: 2, minutes: 680, text: "G train, Phoebe Bridgers on shuffle and the whole car went quiet in my head", map: { "Phoebe Bridgers": PHOEBE }, fk: "listen" },
  { daysAgo: 2, minutes: 200, text: "lunch at the counter place, finally started Klara and the Sun", map: { "Klara and the Sun": KLARA }, fk: "read" },
  { daysAgo: 3, minutes: 900, text: "Film Forum matinee of Chungking Express. half the room laughed at the pineapple cans, I didn't", map: { "Film Forum": FILMFORUM, "Chungking Express": CHUNGKING }, fk: "first_watch" },
  { daysAgo: 4, minutes: 1300, text: "finally watched Solaris. the long drive into the city, I didn't want it to end", ask: { surface: "Solaris", ids: [SOLARIS_72, SOLARIS_02, SOLARIS_68], fk: "first_watch" } },
  { daysAgo: 5, text: "watched Her again on the plane, still a lot", map: { "Her": HER }, fk: "rewatch", sentiment: "mixed" },
  { daysAgo: 6, text: "someone left The Rings of Saturn on the bench outside the library. took it as a sign.", map: { "The Rings of Saturn": RINGS }, fk: "read" },
  { daysAgo: 7, minutes: 400, text: "Heard Sunday on the radio at the laundromat. no idea who, wrote down the hook" },
  { daysAgo: 8, minutes: 300, text: "Japanese Breakfast at Brooklyn Steel. \"this one's for your mom\" and I was gone", map: { "Japanese Breakfast": JBREAKFAST, "Brooklyn Steel": BKSTEEL }, fk: "visit" },
  { daysAgo: 9, text: "Big Thief live recording of Not at full volume while cleaning. best twenty minutes of the week", map: { "Big Thief": BIGTHIEF }, fk: "listen" },
  { daysAgo: 11, minutes: 500, text: "Crying in H Mart on the G, had to close it twice before Nassau", map: { "Crying in H Mart": HMART }, fk: "read" },
  { daysAgo: 12, minutes: 200, text: "Normal People on the ferry. Marianne and Connell, ugh, again", ask: { surface: "Normal People", ids: [NP_BOOK, NP_TV], fk: "note" } },
  { daysAgo: 13, text: "Paterson on a rainy Sunday. small poems, bus routes, a dog. I want my life to be this size.", map: { "Paterson": PATERSON } },
  { daysAgo: 16, minutes: 120, text: "Aftersun. the Under Pressure scene. didn't talk on the walk home", map: { "Aftersun": AFTERSUN }, fk: "first_watch" },
  { daysAgo: 18, minutes: 700, text: "McNally Jackson after work, bought Pachinko and a notebook I don't need", map: { "McNally Jackson": MCNALLY, "Pachinko": PACHINKO }, fk: "visit" },
  { daysAgo: 20, text: "Klara is slow in the best way. the sun as a god. underlined half a page.", map: { "Klara": KLARA }, fk: "read" },
  { daysAgo: 24, minutes: 60, text: "Little Women with mom for her birthday. the attic scene, both of us", ask: { surface: "Little Women", ids: [LW_2019, LW_1994], fk: "rewatch" } },
  { daysAgo: 27, text: "Adrianne Lenker, anything, songs that sound like a kitchen at 7am", map: { "Adrianne Lenker": LENKER }, fk: "listen" },
  { daysAgo: 31, minutes: 900, text: "the Wong one with the noodles and the neon, borrowed the DVD from Marcus", ask: { surface: "the Wong one", ids: [CHUNGKING, FALLEN, ITML], fk: "note" } },
  { daysAgo: 35, text: "Perfect Days at Metrograph. Hirayama and his cassettes. I want a tree photo every day", map: { "Perfect Days": PERFECT, "Metrograph": METROGRAPH }, fk: "first_watch" },
  { daysAgo: 41, text: "Past Lives again with Mina. we both cried at the bar scene, different reasons", map: { "Past Lives": PAST }, fk: "rewatch" },
  { daysAgo: 58, text: "Fallen Angels, neon and noise. Wong Kar-wai is my weather.", map: { "Fallen Angels": FALLEN } },
  { daysAgo: 64, text: "In the Mood for Love was too slow tonight, couldn't settle", map: { "In the Mood for Love": ITML }, sentiment: "negative" },
  { daysAgo: 90, text: "Frances Ha: running down the street to Modern Love. that's the whole review.", map: { "Frances Ha": FRANCES } },
  { daysAgo: 120, text: "reading Norwegian Wood on the ferry, wrote down the line about the well", map: { "Norwegian Wood": NORWOOD }, fk: "read" },
  { daysAgo: 150, text: "Nujabes while writing, again. it makes the cursor feel kind", map: { "Nujabes": NUJABES }, fk: "listen" },
  { daysAgo: 210, text: "In the Mood for Love first time, restrained and devastating.", map: { "In the Mood for Love": ITML }, fk: "first_watch" },
  { daysAgo: 230, text: "Big Thief, Masterpiece, on repeat walking home over the Pulaski Bridge", map: { "Big Thief": BIGTHIEF }, fk: "listen" },
];
