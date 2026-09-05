"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { usdCentsToDop, dopToUsdCents } from "@/lib/pricing";
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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [variants, setVariants] = useState<VariantDraft[]>(
    initialVariants?.map((v) => ({ ...v })) ?? [{ size: "", color: "", priceCents: 0, sku: "", stock: 0 }]
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  async function handleImageUpload(file: File) {
    setUploadError(null);
    const supabase = createBrowserSupabaseClient();
    const path = `${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file);
    if (error) {
      setUploadError(`No se pudo subir la imagen: ${error.message}`);
      return;
    }
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    setImages((prev) => [...prev, data.publicUrl]);
  }

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
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
      const { error } = await supabase.from("products").update(productRow).eq("id", productId);
      if (error) {
        setSaveError(`No se pudo guardar el producto: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase.from("products").insert(productRow).select().single();
      if (error || !data) {
        setSaveError(`No se pudo crear el producto: ${error?.message ?? "error desconocido"}`);
        setSaving(false);
        return;
      }
      productId = data.id;
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
      const { error } = v.id
        ? await supabase.from("product_variants").update(variantRow).eq("id", v.id)
        : await supabase.from("product_variants").insert(variantRow);
      if (error) {
        setSaveError(`No se pudo guardar una variante (${v.sku || v.size || "sin nombre"}): ${error.message}`);
        setSaving(false);
        return;
      }
    }

    router.push("/admin/products");
  }

  async function handleDelete() {
    if (!initialProduct?.id) return;
    if (!window.confirm(`¿Eliminar "${nameEs || "este producto"}"? Esta accion no se puede deshacer.`)) return;

    setDeleting(true);
    setDeleteError(null);
    setDeleteNotice(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from("products").delete().eq("id", initialProduct.id);

    if (!error) {
      router.push("/admin/products");
      return;
    }

    // 23503 = foreign_key_violation - the product has real order history (an
    // order_items row still points at one of its variants), so it can't be
    // hard-deleted without breaking that order's record. Deactivating is the
    // safe fallback: it disappears from the storefront immediately, same
    // outcome the admin actually wants, without losing order data.
    if (error.code === "23503") {
      const { error: deactivateError } = await supabase
        .from("products")
        .update({ is_active: false })
        .eq("id", initialProduct.id);
      if (deactivateError) {
        setDeleteError(`No se pudo eliminar ni desactivar: ${deactivateError.message}`);
      } else {
        setIsActive(false);
        setDeleteNotice(
          "Este producto tiene pedidos asociados, asi que no se puede eliminar por completo - se desactivo en su lugar y ya no aparece en la tienda."
        );
      }
      setDeleting(false);
      return;
    }

    setDeleteError(`No se pudo eliminar: ${error.message}`);
    setDeleting(false);
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
      {uploadError && <p role="alert" className="text-red-600">{uploadError}</p>}
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
          <input placeholder="Precio (RD$)" type="number" value={usdCentsToDop(v.priceCents)} onChange={(e) => {
            const next = [...variants]; next[idx] = { ...v, priceCents: dopToUsdCents(Number(e.target.value)) }; setVariants(next);
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

      {saveError && <p role="alert" className="text-red-600">{saveError}</p>}
      <button onClick={handleSave} disabled={saving} className="mt-4 rounded-full bg-brand-crimson px-6 py-2 text-white disabled:opacity-40">
        {saving ? "Guardando..." : "Guardar"}
      </button>

      {initialProduct?.id && (
        <>
          {deleteNotice && <p role="status" className="text-amber-700">{deleteNotice}</p>}
          {deleteError && <p role="alert" className="text-red-600">{deleteError}</p>}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-full border border-red-600 px-6 py-2 text-red-600 disabled:opacity-40"
          >
            {deleting ? "Eliminando..." : "Eliminar producto"}
          </button>
        </>
      )}
    </div>
  );
}
