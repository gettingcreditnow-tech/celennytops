import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/es.json";
import { VariantSelector } from "@/components/storefront/VariantSelector";
import type { ProductWithVariants } from "@/lib/products";

const product: ProductWithVariants = {
  id: "p1",
  nameEs: "Top rojo",
  nameEn: "Red top",
  descriptionEs: "",
  descriptionEn: "",
  category: "tops",
  images: [],
  isActive: true,
  variants: [
    { id: "v1", productId: "p1", size: "M", color: "Rojo", priceCents: 2500, sku: "T-R-M", stock: 2 },
    { id: "v2", productId: "p1", size: "L", color: "Rojo", priceCents: 2500, sku: "T-R-L", stock: 0 },
  ],
};

describe("VariantSelector", () => {
  it("disables out-of-stock variants and calls onAddToCart with the selected variant", () => {
    const onAddToCart = vi.fn();
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <VariantSelector product={product} locale="es" onAddToCart={onAddToCart} />
      </NextIntlClientProvider>
    );

    expect(screen.getByRole("button", { name: "L" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "M" }));
    fireEvent.click(screen.getByText(/agregar al carrito/i));

    expect(onAddToCart).toHaveBeenCalledWith(product.variants[0]);
  });

  it("shows a temporary confirmation and disables the button to prevent an accidental double-add", () => {
    vi.useFakeTimers();
    const onAddToCart = vi.fn();
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <VariantSelector product={product} locale="es" onAddToCart={onAddToCart} />
      </NextIntlClientProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "M" }));
    fireEvent.click(screen.getByText(/agregar al carrito/i));

    expect(onAddToCart).toHaveBeenCalledTimes(1);
    const addedButton = screen.getByText(/agregado/i);
    expect(addedButton).toBeDisabled();

    fireEvent.click(addedButton);
    expect(onAddToCart).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByText(/agregar al carrito/i)).not.toBeDisabled();

    vi.useRealTimers();
  });

  it("resets the confirmation state when a different variant is selected", () => {
    vi.useFakeTimers();
    const onAddToCart = vi.fn();
    const twoInStock: ProductWithVariants = {
      ...product,
      variants: [
        product.variants[0],
        { id: "v3", productId: "p1", size: "S", color: "Rojo", priceCents: 2500, sku: "T-R-S", stock: 2 },
      ],
    };
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <VariantSelector product={twoInStock} locale="es" onAddToCart={onAddToCart} />
      </NextIntlClientProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "M" }));
    fireEvent.click(screen.getByText(/agregar al carrito/i));
    expect(screen.getByText(/agregado/i)).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "S" }));
    expect(screen.getByText(/agregar al carrito/i)).not.toBeDisabled();

    vi.useRealTimers();
  });
});
