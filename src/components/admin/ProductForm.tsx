"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Product, ProductVariant } from "@/lib/types";

type VariantDraft = Pick<ProductVariant, "size" | "color" | "priceCents" | "sku" | "stock"> & {
  id?: string;
};

export function ProductForm({
  initialProduct,
  initialVariants,
}: {
  initialProduct?: Product;
  initialVariants?: ProductVariant[];
}) {
  const router = useRouter();
  const [nameEs, setNameEs] = useState(initialProduct?.nameEs ?? "");
  const [nameEn, setNameEn] = useState(initialProduct?.nameEn ?? "");
  const [descriptionEs, setDescriptionEs] = useState(initialProduct?.descriptionEs ?? "");
  const [descriptionEn, setDescriptionEn] = useState(initialProduct?.descriptionEn ?? "");
  const [images, setImages] = useState<string[]>(initialProduct?.images ?? []);
  const [isActive, setIsActive] = useState(initialProduct?.isActive ?? true);
  const [variants, setVariants] = useState<VariantDraft[]>(
    initialVariants?.map((v) => ({ ...v })) ?? [{ size: "", color: "", priceCents: 0, sku: "", stock: 0 }]
  );

  async function handleImageUpload(file: File) {
    const supabase = createBrowserSupabaseClient();
    const path = `${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file);
    if (error) return;
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    setImages((prev) => [...prev, data.publicUrl]);
  }

  async function handleSave() {
    const supabase = createBrowserSupabaseClient();
    const productRow = {
      name_es: nameEs,
      name_en: nameEn,
      description_es: descriptionEs,
      description_en: descriptionEn,
      images,
      is_active: isActive,
    };

    let productId = initialProduct?.id;
    if (productId) {
      await supabase.from("products").update(productRow).eq("id", productId);
    } else {
      const { data } = await supabase.from("products").insert(productRow).select().single();
      productId = data!.id;
    }

    for (const v of variants) {
      const variantRow = {
        product_id: productId,
        size: v.size || null,
        color: v.color || null,
        price_cents: v.priceCents,
        sku: v.sku,
        stock: v.stock,
      };
      if (v.id) {
        await supabase.from("product_variants").update(variantRow).eq("id", v.id);
      } else {
        await supabase.from("product_variants").insert(variantRow);
      }
    }

    router.push("/admin/products");
  }

  return (
    <div className="flex max-w-xl flex-col gap-3 px-6 py-6">
      <label>Nombre (ES) <input value={nameEs} onChange={(e) => setNameEs(e.target.value)} /></label>
      <label>Name (EN) <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></label>
      <label>Descripcion (ES) <textarea value={descriptionEs} onChange={(e) => setDescriptionEs(e.target.value)} /></label>
      <label>Description (EN) <textarea value={descriptionEn} onChange={(e) => setDescriptionEn(e.target.value)} /></label>
      <label>
        Activo
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      </label>
      <input type="file" accept="image/*" onChange={(e) => e.target.files && handleImageUpload(e.target.files[0])} />
      <div className="flex gap-2">
        {images.map((src) => (
          <img key={src} src={src} width={80} height={80} alt="" />
        ))}
      </div>

      <h2>Variantes</h2>
      {variants.map((v, idx) => (
        <div key={v.id ?? idx} className="flex gap-2">
          <input placeholder="Talla" value={v.size ?? ""} onChange={(e) => {
            const next = [...variants]; next[idx] = { ...v, size: e.target.value }; setVariants(next);
          }} />
          <input placeholder="Color" value={v.color ?? ""} onChange={(e) => {
            const next = [...variants]; next[idx] = { ...v, color: e.target.value }; setVariants(next);
          }} />
          <input placeholder="Precio (centavos)" type="number" value={v.priceCents} onChange={(e) => {
            const next = [...variants]; next[idx] = { ...v, priceCents: Number(e.target.value) }; setVariants(next);
          }} />
          <input placeholder="SKU" value={v.sku} onChange={(e) => {
            const next = [...variants]; next[idx] = { ...v, sku: e.target.value }; setVariants(next);
          }} />
          <input placeholder="Stock" type="number" value={v.stock} onChange={(e) => {
            const next = [...variants]; next[idx] = { ...v, stock: Number(e.target.value) }; setVariants(next);
          }} />
        </div>
      ))}
      <button type="button" onClick={() => setVariants([...variants, { size: "", color: "", priceCents: 0, sku: "", stock: 0 }])}>
        + Variante
      </button>

      <button onClick={handleSave} className="mt-4 rounded-full bg-brand-crimson px-6 py-2 text-white">
        Guardar
      </button>
    </div>
  );
}
