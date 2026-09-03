import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/es.json";
import { CartProvider, useCart } from "@/context/CartContext";
import CartPage from "@/app/[locale]/cart/page";

function AddButton() {
  const { addItem } = useCart();
  return (
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
  );
}

function renderCartPage() {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <CartProvider>
        <AddButton />
        <CartPage />
      </CartProvider>
    </NextIntlClientProvider>
  );
}

describe("CartPage", () => {
  it("hides the checkout link while the cart is empty", () => {
    renderCartPage();
    expect(screen.getByText(/vacio/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /finalizar compra/i })).not.toBeInTheDocument();
  });

  it("shows a checkout link to /checkout once the cart has items", () => {
    renderCartPage();
    fireEvent.click(screen.getByText("add"));

    expect(screen.getByText("Top rojo")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /finalizar compra/i });
    expect(link).toHaveAttribute("href", "/es/checkout");
  });
});
