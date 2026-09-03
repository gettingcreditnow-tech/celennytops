import { describe, it, expect } from "vitest";
import { cartReducer, type CartState, type CartItem } from "@/lib/cart";

const empty: CartState = { items: [] };

const item: CartItem = {
  variantId: "v1",
  productId: "p1",
  name: "Top rojo",
  size: "M",
  color: "Rojo",
  unitPriceCents: 2500,
  quantity: 1,
  maxStock: 3,
};

describe("cartReducer", () => {
  it("adds a new item", () => {
    const state = cartReducer(empty, { type: "ADD_ITEM", item });
    expect(state.items).toHaveLength(1);
    expect(state.items[0].quantity).toBe(1);
  });

  it("increments quantity when adding an existing variant", () => {
    const withItem = cartReducer(empty, { type: "ADD_ITEM", item });
    const state = cartReducer(withItem, {
      type: "ADD_ITEM",
      item: { ...item, quantity: 1 },
    });
    expect(state.items[0].quantity).toBe(2);
  });

  it("caps quantity at maxStock", () => {
    const withItem = cartReducer(empty, { type: "ADD_ITEM", item });
    const state = cartReducer(withItem, {
      type: "ADD_ITEM",
      item: { ...item, quantity: 5 },
    });
    expect(state.items[0].quantity).toBe(3);
  });

  it("removes an item", () => {
    const withItem = cartReducer(empty, { type: "ADD_ITEM", item });
    const state = cartReducer(withItem, { type: "REMOVE_ITEM", variantId: "v1" });
    expect(state.items).toHaveLength(0);
  });

  it("sets quantity directly, capped at maxStock", () => {
    const withItem = cartReducer(empty, { type: "ADD_ITEM", item });
    const state = cartReducer(withItem, {
      type: "SET_QUANTITY",
      variantId: "v1",
      quantity: 10,
    });
    expect(state.items[0].quantity).toBe(3);
  });

  it("removes the item when quantity is set to 0", () => {
    const withItem = cartReducer(empty, { type: "ADD_ITEM", item });
    const state = cartReducer(withItem, {
      type: "SET_QUANTITY",
      variantId: "v1",
      quantity: 0,
    });
    expect(state.items).toHaveLength(0);
  });

  it("clears the cart", () => {
    const withItem = cartReducer(empty, { type: "ADD_ITEM", item });
    expect(cartReducer(withItem, { type: "CLEAR" }).items).toHaveLength(0);
  });
});
