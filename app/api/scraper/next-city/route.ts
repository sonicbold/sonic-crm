import { dynamic, GET as nextCity } from "@/features/finder/api/next-city";
import { guard } from "@/shared/route";

export { dynamic };

export const GET = guard("finder.next-city", nextCity);
