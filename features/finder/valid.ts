import { isChainListing } from "@/features/finder/niche";
import type { Lead, MapPlace } from "@/features/finder/types";

/** NANP toll-free prefixes. These are call centers, not a local shop line. */
const TOLL_FREE_PREFIXES = new Set(["800", "833", "844", "855", "866", "877", "888"]);

/** Last 10 digits, used to match phones across formats. */
export function phoneKey(phone: string): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  const last10 = digits.slice(-10);
  return last10.length === 10 ? last10 : null;
}

export function isTollFreePhone(phone: string): boolean {
  const key = phoneKey(phone);
  if (!key) return false;
  return TOLL_FREE_PREFIXES.has(key.slice(0, 3));
}

export function placeDedupKey(place: Pick<MapPlace, "placeId" | "phone" | "url" | "title">): string {
  if (place.placeId) return `pid:${place.placeId}`;
  const phone = phoneKey(place.phone);
  if (phone) return `ph:${phone}`;
  if (place.url) return `url:${place.url}`;
  return `title:${place.title.trim().toLowerCase()}`;
}

export function hasUsablePhone(place: Pick<MapPlace, "phone">): boolean {
  const key = phoneKey(place.phone);
  if (!key) return false;
  return !isTollFreePhone(place.phone);
}

/** Words that look like a shop title, not a person. */
const NOT_A_PERSON = new Set([
  "city", "emergency", "metro", "pro", "royal", "ace", "all", "best", "fast", "quick",
  "hour", "local", "family", "quality", "premier", "elite", "affordable", "discount",
  "budget", "express", "rapid", "super", "ultra", "prime", "first", "top", "the",
  "and", "of", "a", "new", "big", "main", "master", "expert", "experts", "professional",
  "professionals", "licensed", "guaranteed", "same", "day", "total", "complete",
  "general", "home", "house", "water", "pipe", "pipes", "rooter", "drain", "drains",
  "sewer", "sewers", "plumbing", "plumber", "plumbers", "service", "services",
  "company", "reliable", "trusted", "honest", "advanced", "advantage", "american",
  "national", "united", "central", "north", "south", "east", "west", "downtown",
  "county", "area", "mobile", "on", "call", "any", "time", "your", "our", "my",
  "sons", "son", "brothers", "bros", "jr", "sr", "is", "was", "for", "with",
  "abundant", "ironclad", "ultimate", "apex", "dear", "plus", "intended",
  "outfitters", "nerd", "residential", "commercial", "electrical", "star",
  "dragon", "blue", "round", "rock", "cedar", "park", "texas", "georgia", "plumb",
  "lion", "atlas", "oasis", "marlin", "empire", "global", "titan", "hydro", "aqua",
  "flow", "ninja", "phoenix", "eagle", "hawk", "wolf", "bear", "tiger", "shark",
  "cobra", "viper", "diamond", "steel", "iron", "gold", "silver", "nova", "summit",
  "ocean", "river", "valley", "peak", "turbo", "rocket", "dyno", "dynamo", "giant",
]);

/** Common given names. A shop brand like Lion is not on this list. */
const GIVEN_NAMES = new Set([
  "aaron", "adam", "adrian", "alan", "albert", "alejandro", "alex", "alexander", "alexis",
  "alice", "alicia", "amanda", "amy", "ana", "andre", "andrea", "andres", "andrew", "andy",
  "angel", "angela", "anna", "anthony", "antonio", "armando", "arthur", "austin",
  "barbara", "ben", "benjamin", "bill", "billy", "bob", "bobby", "brad", "brandon", "brenda",
  "brian", "bruce", "bryan", "caleb", "calvin", "carl", "carlos", "carmen", "carol", "carolina",
  "caroline", "carter", "cesar", "chad", "charles", "charlie", "chris", "christian", "christina",
  "christopher", "cindy", "claudia", "clayton", "cliff", "cole", "colin", "corey", "cory",
  "craig", "cristian", "crystal", "curtis", "cynthia", "dale", "dan", "dana", "daniel", "danny",
  "dave", "david", "dean", "deborah", "dennis", "derek", "diana", "diane", "diego", "dominic",
  "don", "donald", "douglas", "drew", "duane", "dustin", "dylan", "eddie", "edgar", "eduardo",
  "edward", "edwin", "eli", "elias", "elijah", "elizabeth", "emily", "emma", "emmanuel", "enrique",
  "eric", "erik", "ernest", "ernesto", "ethan", "eugene", "eva", "evan", "felix", "fernando",
  "felipe", "francis", "francisco", "frank", "fred", "freddy", "gabriel", "gary", "george",
  "gerald", "gilbert", "glen", "glenn", "gordon", "grace", "greg", "gregory", "guillermo",
  "gustavo", "harold", "harry", "hector", "helen", "henry", "herbert", "howard", "hugo", "ian",
  "ignacio", "irene", "isaac", "isabel", "ivan", "jack", "jackie", "jacob", "jake", "james",
  "jamie", "jan", "janet", "jared", "jason", "javier", "jay", "jean", "jeff", "jeffrey",
  "jennifer", "jeremy", "jerry", "jesse", "jessica", "jesus", "jim", "jimmy", "joanna", "joaquin",
  "jody", "joe", "joel", "john", "johnny", "jon", "jonathan", "jordan", "jorge", "jose", "joseph",
  "josh", "joshua", "juan", "julio", "justin", "karen", "karl", "kate", "katherine", "kathy",
  "katie", "keith", "kelly", "ken", "kenneth", "kevin", "kim", "kyle", "lance", "larry", "laura",
  "lauren", "lawrence", "lee", "leo", "leon", "leonard", "leslie", "liam", "linda", "lisa",
  "logan", "lorenzo", "louis", "lucas", "luis", "luke", "manuel", "marc", "marco", "marcus",
  "margaret", "maria", "mario", "mark", "martha", "martin", "mary", "mason", "matt", "matthew",
  "maurice", "max", "melvin", "michael", "michelle", "miguel", "mike", "mitchell", "monica",
  "morgan", "nancy", "natalie", "nathan", "nathaniel", "neil", "nelson", "nicholas", "nick",
  "nicole", "noah", "norman", "oliver", "omar", "oscar", "owen", "pablo", "pat", "patricia",
  "patrick", "paul", "pedro", "peter", "philip", "phillip", "preston", "rafael", "ralph", "ramiro",
  "ramon", "randy", "raquel", "raul", "ray", "raymond", "rebecca", "ricardo", "richard", "rick",
  "ricky", "rob", "robert", "roberto", "robin", "rodney", "roger", "roland", "ron", "ronald",
  "rosario", "roy", "ruben", "russell", "ryan", "salvador", "sam", "samantha", "samuel", "santiago",
  "sara", "sarah", "scott", "sean", "sergio", "seth", "shane", "sharon", "shaun", "shawna",
  "shelby", "shirley", "stanley", "stephanie", "stephen", "steve", "steven", "stuart", "susan",
  "tanner", "taylor", "ted", "teresa", "terry", "theodore", "thomas", "tim", "timothy", "todd",
  "tom", "tommy", "tony", "tracy", "travis", "trevor", "troy", "tyler", "vernon", "vicente",
  "victor", "vincent", "virginia", "walter", "warren", "wayne", "wendy", "wesley", "will",
  "william", "willie", "wyatt", "xavier", "yesenia", "yvonne", "zach", "zachary",
]);

function isTradeWord(word: string): boolean {
  return NOT_A_PERSON.has(word.toLowerCase().replace(/[^a-z]/g, ""));
}

function nameKey(word: string): string {
  return word.toLowerCase().replace(/[^a-z]/g, "");
}

function isGivenName(word: string): boolean {
  const key = nameKey(word);
  return key.length >= 2 && GIVEN_NAMES.has(key);
}

function looksLikeSurname(word: string): boolean {
  const key = nameKey(word);
  if (key.length < 2) return false;
  if (isTradeWord(word)) return false;
  return /^[A-Za-z][A-Za-z.'-]*$/.test(word);
}

/** First name, or first + last. Shop brands and mascots (Lion, Atlas) are not people. */
export function soundsLikeHumanName(name: string): boolean {
  const words = name.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length || words.length > 4) return false;
  if (!isGivenName(words[0]!)) return false;
  return words.slice(1).every((word) => looksLikeSurname(word));
}

/**
 * Maps sometimes lists an owner. Keep a personal name and skip business titles.
 */
export function usableListedOwner(name: string | undefined, businessName: string): string | null {
  const raw = (name || "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  if (raw.toLowerCase() === businessName.trim().toLowerCase()) return null;
  if (/\d|llc|inc\b|ltd\b|plumbing|drain|services|company|supply|corp\b/i.test(raw)) return null;
  if (/not found|unknown|^n\/a$|^owner$|^the owner$/i.test(raw)) return null;
  const words = raw.split(" ");
  if (words.length > 4) return null;
  if (!words.every((word) => /^[A-Za-z][A-Za-z.'-]*$/.test(word))) return null;
  if (words.some((word) => isTradeWord(word))) return null;
  if (!soundsLikeHumanName(raw)) return null;
  return raw;
}

/**
 * Owner printed on the Maps listing only. The shop title is never parsed for a person.
 */
export function listingOwner(place: { listedOwnerName?: string; title: string }): string | null {
  return usableListedOwner(place.listedOwnerName, place.title);
}

/**
 * A valid outreach row has a callable phone. A failed review summary still counts;
 * the note records that the summary is missing.
 */
export function isUsableLead(lead: Lead): boolean {
  if (!phoneKey(lead.phone)) return false;
  if (isTollFreePhone(lead.phone)) return false;
  if (/^not listed$/i.test((lead.phone || "").trim())) return false;
  return true;
}

/** One-click runs count every plumber we can call. Owner name is saved when found, and is not required. */
export function isQualityLead(lead: Lead): boolean {
  if (!isUsableLead(lead)) return false;
  if (isChainListing(lead.businessName)) return false;
  return true;
}
