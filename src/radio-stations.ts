export type Station = {
  slug: string;
  name: string;
  description?: string;
  shuffle: boolean;
  explicit?: boolean;
};

export const STATIONS: Station[] = [
  { slug: "101-1-the-deli",    name: "101.1 The Deli", description:"take a number. get in line", shuffle: true, explicit: true},
  { slug: "99-9-recency-bias",    name: "99.9 Recency Bias", description:"my favorite new music.", explicit: true,  shuffle: true },
  { slug: "98-7-nebulous-fm",     name: "98.7 nebulousFM",  description:"eclectic variety. real wildcard on the aux.", explicit:true,  shuffle: true },
  { slug: "97-3-quarrying", name: "97.3 Quarrying", description:"i found diamonds! i found diamonds!", shuffle: true },
  { slug: "95-5-soft-falloff", name: "95.5 soft falloff", description:"goose down jams. generally instrumental.", shuffle: true }
];
