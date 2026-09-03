import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/es.json";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { ProductWithVariants } from "@/lib/products";

const product: ProductWithVariants = {
  id: "p1",
  nameEs: "Top rojo",
  nameEn: "Red top",
  descriptionEs: "",
  descriptionEn: "",
  category: "tops",
  images: ["/placeholder.jpg"],
  isActive: true,
  variants: [
    { id: "v1", productId: "p1", size: "M", color: "Rojo", priceCents: 2500, sku: "T-R-M", stock: 2 },
    { id: "v2", productId: "p1", size: "L", color: "Rojo", priceCents: 2500, sku: "T-R-L", stock: 0 },
  ],
};

describe("ProductCard", () => {
  it("shows the lowest variant price and does not mark in-stock products as sold out", () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <ProductCard product={product} locale="es" />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("Top rojo")).toBeInTheDocument();
    expect(screen.getByText("$25.00")).toBeInTheDocument();
    expect(screen.queryByText(/agotado/i)).not.toBeInTheDocument();
  });

  it("marks a product sold out when every variant has 0 stock", () => {
    const soldOut = { ...product, variants: product.variants.map((v) => ({ ...v, stock: 0 })) };
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <ProductCard product={soldOut} locale="es" />
      </NextIntlClientProvider>
    );
    expect(screen.getByText(/agotado/i)).toBeInTheDocument();
  });
});
