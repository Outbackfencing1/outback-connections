import { describe, expect, it } from "vitest";
import {
  buildSearchUrl,
  cleanBusinessName,
  directoryExternalId,
  isSourcePlatform,
  prettyPlatform,
} from "@/lib/source-platforms";

describe("cleanBusinessName", () => {
  it("turns & into 'and' and strips punctuation", () => {
    expect(cleanBusinessName("Kings Fencing & Gates")).toBe("Kings Fencing and Gates");
    expect(cleanBusinessName("Little's Fencing Bathurst")).toBe("Littles Fencing Bathurst");
    expect(cleanBusinessName("  MHM Contracting - NSW ")).toBe("MHM Contracting NSW");
  });
});

describe("directoryExternalId", () => {
  it("is stable for the same name + postcode and platform", () => {
    expect(directoryExternalId("facebook", "Pattison Rural Contracting", "2650")).toBe(
      "facebook:pattison-rural-contracting:2650"
    );
    expect(directoryExternalId("facebook", "PATTISON  Rural   Contracting", "2650")).toBe(
      "facebook:pattison-rural-contracting:2650"
    );
  });
});

describe("buildSearchUrl", () => {
  it("builds an honest search on the named platform", () => {
    expect(buildSearchUrl("facebook", "Abatis Fencing", "2765", "NSW")).toBe(
      "https://www.facebook.com/search/pages/?q=Abatis+Fencing"
    );
    expect(buildSearchUrl("yellow_pages", "Davis Quality Fencing", "2800", "NSW")).toBe(
      "https://www.yellowpages.com.au/search/listings?clue=Davis+Quality+Fencing&locationClue=2800"
    );
    expect(buildSearchUrl("web", "Deveigne Fencing", "2790", "NSW")).toBe(
      "https://www.google.com/search?q=Deveigne+Fencing+2790+NSW"
    );
  });
});

describe("prettyPlatform / isSourcePlatform", () => {
  it("labels known platforms and title-cases unknown ones", () => {
    expect(prettyPlatform("facebook")).toBe("Facebook");
    expect(prettyPlatform("official_website")).toBe("its official website");
    expect(prettyPlatform("some_new_source")).toBe("Some New Source");
    expect(prettyPlatform(null)).toBeNull();
    expect(isSourcePlatform("truelocal")).toBe(true);
    expect(isSourcePlatform("adzuna")).toBe(false);
  });
});
