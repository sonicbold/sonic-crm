import { splitLocation } from "../features/finder/scraper-run";

const addresses = [
  "5074 Griggs Rd #4200, Houston, TX 77021, USA",
  "2410 Jamestown Mal, Houston, TX 77057, USA",
  "7707 Bissonnet St #6700, Houston, TX 77074, USA",
  "24119 Lenze Rd #1006, Spring, TX 77389, USA",
  "28131 Robinson Rd, Conroe, TX 77385, USA",
  "2826 Center St, Deer Park, TX 77536, USA",
  "1126 W 26th St, Houston, TX 77008, USA",
  "2812 Cortlandt St, Houston, TX 77008, USA",
  "7305 Navigation Blvd Ste 53, Houston, TX 77011, USA",
];

for (const location of addresses) {
  splitLocation(location);
}

console.log("replayed", addresses.length);
