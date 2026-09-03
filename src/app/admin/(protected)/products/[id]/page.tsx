import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProductForm } from "@/components/admin/ProductForm";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: product } = await supabase.from("products").select("*").eq("id", id).single();
  const { data: variants } = await supabase.from("product_variants").select("*").eq("product_id", id);

  const mappedProduct = {
    id: product.id,
    nameEs: product.name_es,
    nameEn: product.name_en,
    descriptionEs: product.description_es,
    descriptionEn: product.description_en,
    category: product.category,
    images: product.images,
    isActive: product.is_active,
  };
  const mappedVariants = (variants ?? []).map((v) => ({
    id: v.id,
    productId: v.product_id,
    size: v.size,
    color: v.color,
    priceCents: v.price_cents,
    sku: v.sku,
    stock: v.stock,
  }));

  return <ProductForm initialProduct={mappedProduct} initialVariants={mappedVariants} />;
}
