# Celenny Tops — Tienda online (Fase 1) — Diseño

**Fecha:** 2026-09-02
**Estado:** Aprobado para pasar a plan de implementación

## Contexto

Celenny Tops es una tienda de artículos tejidos a crochet (inicialmente "tops"). El
objetivo es lanzar una tienda online completa: catálogo, carrito, checkout con pago
por PayPal, y un panel de administración para gestionar productos y pedidos sin
tocar código.

Este spec cubre la **Fase 1**: una tienda funcional y vendible con envío por tarifas
fijas. El cálculo automático de envío por transportista queda explícitamente fuera
de alcance y se aborda en una fase posterior, como su propio spec.

## Identidad visual

Basada en el logo proporcionado: ilustración de una chica tejiendo, fondo rosa
pastel, tipografía script en rojo carmesí para "Celenny", lema "Handmade with
love". Dirección visual: cálido, femenino, artesanal.

- Fondo: rosa pastel
- Acentos / CTAs / tipografía de títulos: rojo carmesí
- Tipografía de títulos: script (estilo del logo)
- Tipografía de cuerpo: sans-serif legible
- El archivo del logo debe colocarse en el proyecto (`public/logo.png` o similar)
  antes de implementar el header/favicon — pendiente de que el usuario lo aporte
  como archivo.

## Stack técnico

- **Next.js** (App Router, TypeScript) — un solo proyecto para tienda pública (`/`)
  y panel admin (`/admin`)
- **Supabase** — Postgres (datos), Auth (login de admins), Storage (fotos de
  producto)
- **PayPal Orders API (Smart Buttons)** — checkout con confirmación automática de
  pago
- **next-intl** — soporte bilingüe ES/EN, español por defecto
- **Resend** — emails transaccionales (confirmación de pedido)
- **Vercel** — hosting

## Modelo de datos

- `products`: id, nombre (ES/EN), descripción (ES/EN), categoría, imágenes,
  activo/inactivo
- `product_variants`: id, product_id, talla, color, precio, SKU, stock
- `shipping_zones`: id, nombre, lista de países (códigos ISO), tarifa fija (USD)
- `orders`: id, nombre cliente, email, dirección, país, shipping_zone_id, estado
  (pendiente/pagado/enviado/cancelado), total, idioma, número de seguimiento
  (opcional)
- `order_items`: id, order_id, variant_id, cantidad, precio al momento de compra
- Admins: gestionados vía Supabase Auth (sin tabla custom); ambos administradores
  tienen los mismos permisos

Regla de negocio: cuando el stock de una variante llega a 0, deja de poder
agregarse al carrito y se muestra "Agotado".

## Tienda pública

- **Home:** hero con identidad visual, destacados, acceso al catálogo
- **Catálogo:** grid de tops con foto, nombre, precio, swatches de variantes
  disponibles; agotados atenuados con etiqueta "Agotado"
- **Página de producto:** galería, descripción, selector de talla/color (solo
  variantes con stock son seleccionables), "Agregar al carrito"
- **Carrito:** editable (cantidad, quitar), muestra subtotal; el envío se calcula
  en el checkout
- **Selector de idioma ES/EN** en el header, persiste la elección

## Checkout y pago

1. Cliente revisa el carrito y pasa a checkout
2. Completa datos de envío (nombre, email, dirección, país) — el país determina
   automáticamente la zona de envío y su tarifa
3. Resumen: subtotal + envío = total
4. Pago vía **PayPal Smart Buttons**, dentro del flujo de checkout
5. Al confirmarse el pago (webhook/callback de PayPal), se crea el pedido en
   `orders` con estado **"pagado"** y se descuenta el stock de las variantes
   compradas
6. Página de confirmación + email al cliente

Si el pago falla o se cancela, no se crea el pedido ni se descuenta stock.

## Panel de administración (`/admin`)

- **Login:** email + contraseña (Supabase Auth), 2 administradores, mismos
  permisos
- **Productos:** crear/editar/eliminar productos y variantes (talla, color,
  precio, stock, fotos), activar/desactivar, traducciones ES/EN
- **Pedidos:** lista con estado, detalle (cliente, items, dirección, total),
  marcar como "enviado" + número de seguimiento (texto libre, opcional)
- **Zonas de envío:** editar las 3 zonas (nombre, países, tarifa USD) sin tocar
  código
- **Dashboard simple** (baja prioridad): pedidos pendientes de envío, productos
  con poco stock

## Envío (Fase 1)

3 zonas fijas configurables desde el admin, ej.:
- País local
- Latinoamérica
- Resto del mundo

Cada zona tiene una tarifa fija en USD. El país que ingresa el cliente en el
checkout determina la zona aplicada.

## Notificaciones por email

Al confirmarse el pago (vía Resend):
- Email de confirmación al cliente, en su idioma, con resumen del pedido
- Aviso de "nuevo pedido" a los administradores

## Moneda

USD para toda la tienda (precios, PayPal, panel admin).

## Explícitamente fuera de alcance (Fase 1)

- Cálculo automático de envío por transportista (API de EasyPost/Shippo/carrier
  directo) — Fase 2
- Múltiples categorías de producto (catálogo empieza con una sola: tops)
- Roles de admin distintos (ambos administradores tienen el mismo acceso)
- Cupones / descuentos
- Multi-moneda

## Testing

- Tests unitarios de lógica de negocio: cálculo de totales, asignación de zona de
  envío por país, descuento de stock
- Test de flujo de checkout end-to-end (con PayPal en modo sandbox)
- Verificación manual del panel admin (CRUD de productos, pedidos, zonas)
