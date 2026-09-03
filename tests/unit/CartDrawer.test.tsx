import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/es.json";
import { CartProvider, useCart } from "@/context/CartContext";
import { CartDrawer } from "@/components/storefront/CartDrawer";

function Harness() {
  const { addItem } = useCart();
  return (
    <>
      <button
        onClick={() =>
          addItem({
            variantId: "v1",
            productId: "p1",
            name: "Top rojo",
            size: "M",
            color: "Rojo",
            unitPriceCents: 2500,
            quantity: 1,
            maxStock: 3,
          })
        }
      >
        add
      </button>
      <CartDrawer />
    </>
  );
}

describe("CartDrawer", () => {
  it("shows the empty state, then the item and subtotal after adding", () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <CartProvider>
          <Harness />
        </CartProvider>
      </NextIntlClientProvider>
    );

    expect(screen.getByText(/vacio/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText("add"));

    expect(screen.getByText("Top rojo")).toBeInTheDocument();
    expect(screen.getByText("25.00")).toBeInTheDocument();
  });
});
