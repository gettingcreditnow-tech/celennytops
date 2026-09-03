import { createServerSupabaseClient } from "./supabase/server";
import type { Product, ProductVariant } from "./types";

export type ProductWithVariants = Product & { variants: ProductVariant[] };

function mapProduct(row: any): Product {
  return {
    id: row.id,
    nameEs: row.name_es,
    nameEn: row.name_en,
    descriptionEs: row.description_es,
    descriptionEn: row.description_en,
    category: row.category,
    images: row.images ?? [],
    isActive: row.is_active,
  };
}

function mapVariant(row: any): ProductVariant {
  return {
    id: row.id,
    productId: row.product_id,
    size: row.size,
    color: row.color,
    priceCents: row.price_cents,
    sku: row.sku,
    stock: row.stock,
  };
}

export async function listActiveProducts(): Promise<ProductWithVariants[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("*, product_variants(*)")
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...mapProduct(row),
    variants: (row.product_variants ?? []).map(mapVariant),
  }));
}

export async function getProductById(id: string): Promise<ProductWithVariants | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("*, product_variants(*)")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...mapProduct(data), variants: (data.product_variants ?? []).map(mapVariant) };
}
