import { describe, expect, it } from "vitest";
import { parseTradeClick, tradeOfferDestination, tradeOfferHref } from "@/lib/trade-offer";

describe("trade offer links", () => {
  it("send the card's buttons through the logging redirect", () => {
    expect(tradeOfferHref("clipgun", "listing", "fencing-contractor")).toBe(
      "/go/trade?to=clipgun&from=listing&cat=fencing-contractor"
    );
    expect(tradeOfferHref("store", "claim", "plumbing")).toBe("/go/trade?to=store&from=claim");
  });

  it("redirect to the store with the same UTM tags as before", () => {
    expect(tradeOfferDestination("clipgun", "listing")).toBe(
      "https://outbackfencingsupplies.com.au/products/20v-cordless-c-ring-gun?utm_source=outbackconnections&utm_medium=trade_cta&utm_campaign=fencing_contractors&utm_content=listing"
    );
    expect(tradeOfferDestination("store", "claim")).toBe(
      "https://outbackfencingsupplies.com.au/?utm_source=outbackconnections&utm_medium=trade_cta&utm_campaign=fencing_contractors&utm_content=claim"
    );
  });

  it("never redirect anywhere it was told to; unknown input lands on the store home page", () => {
    const click = parseTradeClick(
      new URLSearchParams({ to: "https://evil.example.com", from: "<x>", cat: "anything" })
    );
    expect(click).toEqual({ target: "store", placement: "listing", category: null });
    expect(tradeOfferDestination(click.target, click.placement)).toMatch(
      /^https:\/\/outbackfencingsupplies\.com\.au\/\?/
    );
  });

  it("read a well-formed click", () => {
    expect(parseTradeClick(new URLSearchParams("to=clipgun&from=claim&cat=fencing-labour"))).toEqual({
      target: "clipgun",
      placement: "claim",
      category: "fencing-labour",
    });
  });
});
