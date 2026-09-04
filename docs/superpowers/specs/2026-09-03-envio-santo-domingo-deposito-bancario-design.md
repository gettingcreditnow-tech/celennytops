# Celenny Tops — Zonas de envío en Santo Domingo + Depósito bancario — Diseño

**Fecha:** 2026-09-03
**Estado:** Aprobado para pasar a plan de implementación

## Contexto

El Fase 1 (`2026-09-02-tienda-fase1-design.md`) lanzó la tienda con envío por
tarifa fija y pago exclusivo por PayPal. Este spec cubre la fase de envío por
transportista que aquel documento dejó pendiente, más una nueva forma de pago:

1. La zona de envío "país local" usaba `CO` (Colombia) como marcador de
   posición desde el seed original. El negocio real opera desde **República
   Dominicana** (las cuentas bancarias y la transportadora lo confirman), así
   que la zona local se corrige a `DO`, y además se subdivide en 4 zonas de
   Santo Domingo con tarifas propias, usando la transportadora **VIMENPAQ**.
2. Los clientes de esas 4 zonas pueden pagar además por **depósito
   bancario** (transferencia a una cuenta dominicana), subiendo una foto del
   comprobante desde el checkout. El pedido queda pendiente de confirmación
   manual por la administradora.

Fuera de alcance: cálculo de envío para otros países más allá de las zonas
Latinoamérica / resto del mundo ya existentes (sin cambios), y cualquier
automatización de verificación del comprobante (OCR, etc.) — la revisión es
siempre humana.

## Parte 1 — Zonas de envío de Santo Domingo

### Datos

La zona "país local" (antes `CO`, tarifa única) se reemplaza por 4 filas en
`shipping_zones`, todas con `country_codes = ['DO']`, cada una con un
**sector** propio y su tarifa en USD (convertida desde pesos dominicanos,
redondeada):

| Sector              | Precio DOP | Precio USD |
|----------------------|-----------:|-----------:|
| Santo Domingo Oeste   | 200        | $4.00      |
| Distrito Nacional     | 250        | $5.00      |
| Santo Domingo Norte   | 350        | $6.00      |
| Santo Domingo Este    | 400        | $7.00      |

Todas se transportan con **VIMENPAQ** — el nombre de la transportadora se
muestra en el resumen de envío del checkout, no en cada zona individual.

Las zonas Latinoamérica y resto del mundo no cambian.

### Modelo de datos

`shipping_zones` gana una columna nueva:

```sql
alter table shipping_zones add column sector text;
```

- `sector` es `null` para las zonas existentes (Latinoamérica, resto del
  mundo) y para cualquier zona futura que no distinga por sector.
- Las 4 filas de Santo Domingo tienen `sector` con el nombre exacto del área
  (`'Santo Domingo Oeste'`, `'Distrito Nacional'`, `'Santo Domingo Norte'`,
  `'Santo Domingo Este'`).
- `ShippingZone` (tipo TS) gana `sector: string | null`.

### Lógica de emparejamiento

`getShippingZoneForCountry` (en `src/lib/shipping.ts`) recibe un tercer
parámetro opcional `sector`:

- Si `countryCode === 'DO'`: exige que `sector` esté presente y busca la zona
  cuyo `country_codes` incluya `'DO'` **y** cuyo `sector` coincida
  exactamente. Sin sector, no hay match (el checkout no deja avanzar sin
  elegir zona).
- Para cualquier otro país: se mantiene el comportamiento actual (match por
  `country_codes`, ignorando `sector`).

`buildOrderDraft` (en `src/lib/order-draft.ts`) pasa el sector recibido del
cliente a esta función; el resto de su lógica de validación de stock/precio
no cambia.

### Checkout (UI)

En `src/app/[locale]/checkout/page.tsx`:

- Cuando `form.countryCode === 'DO'`, el campo de texto libre "Ciudad" se
  reemplaza por un `<select>` con las 4 opciones. Las opciones se derivan de
  las zonas ya cargadas (`zones.filter(z => z.countryCodes.includes('DO') &&
  z.sector)`), no de una lista fija en el frontend — si el sector o su precio
  cambian algún día, alcanza con editar la fila en Supabase.
- El valor elegido se guarda en `form.city` (mismo campo que ya existe;
  para otros países sigue siendo texto libre como hoy).
- El resumen de envío pasa de `"Envío: $X.XX"` a
  `"Envío (VIMENPAQ): $X.XX"` cuando la zona coincidida tiene `sector` (las
  4 zonas de Santo Domingo). No hace falta guardar el nombre de la
  transportadora en la base de datos — hoy solo hay una (VIMENPAQ), así que
  el checkout la muestra como texto fijo siempre que `zone.sector` no sea
  `null`. Si en el futuro hay transportadoras distintas por zona, ese es el
  momento de añadir una columna `carrier`.

## Parte 2 — Depósito bancario

### Cuándo se ofrece

Solo cuando el país es `DO` **y** ya hay una zona de Santo Domingo
seleccionada (es decir, mismas condiciones bajo las que aparece VIMENPAQ).
Para cualquier otro país, el checkout muestra únicamente PayPal, sin cambios.

### Qué ve el cliente

Debajo de los botones de PayPal, un bloque nuevo (componente
`BankTransferPayment.tsx`) con:

- Las 3 cuentas, fijas en el código (no son datos de producto, no cambian
  por pedido):
  - BHD — 33126420012
  - Banreservas — 9605666479
  - Qik — 1006892608
  - Todas a nombre de **Celenny Caraballo**, cédula 402-0399758-6
- El texto "Por favor, enviarme el comprobante de pago." (y su equivalente
  en inglés para el locale `en`).
- Un campo de subida de archivo (solo imagen: `image/*`, límite 5 MB).
- Un botón "Enviar comprobante y confirmar pedido", deshabilitado hasta que
  haya una imagen seleccionada.

### Flujo de creación del pedido

Nueva ruta `POST /api/bank-transfer/create-order` (`multipart/form-data`:
los mismos campos que ya envía `create-order` de PayPal — `items`, `customer`,
`locale` — más el archivo `proof`).

1. Valida `items` y `customer` igual que la ruta de PayPal
   (`parseCartItems`).
2. Exige `customer.countryCode === 'DO'`; cualquier otro valor se rechaza
   (esta ruta nunca debe poder usarse fuera de las zonas de Santo Domingo,
   sin importar lo que mande el cliente).
3. Reconstruye el precio/stock/envío desde la base de datos con
   `buildOrderDraft` — mismo mecanismo anti-fraude que PayPal: nada del
   monto final sale del cliente.
4. Exige que venga un archivo `proof` (imagen, ≤ 5 MB); si falta o no
   cumple, rechaza con 400.
5. Sube la imagen al bucket privado `payment-proofs` (Supabase Storage,
   usando el cliente de servicio — el navegador del cliente nunca escribe
   directo al bucket, así que no hace falta ninguna política pública de
   escritura).
6. Inserta la fila en `orders` con `status: 'pending'`,
   `payment_method: 'bank_transfer'`, `payment_proof_path` apuntando al
   archivo recién subido, `paypal_order_id: null`.
7. Inserta `order_items` igual que la ruta de PayPal.
8. Envía el correo de aviso a la administradora (reutilizando
   `sendAdminNewOrderEmail`), indicando que es un pedido por depósito
   pendiente de revisar comprobante.
9. Responde `{ orderId }`.

El checkout, al recibir `orderId`, vacía el carrito y redirige a
`/checkout/confirmation/{orderId}?method=bank_transfer`.

### Modelo de datos

Nueva migración `0004_bank_transfer_payments.sql`:

```sql
alter table orders
  add column payment_method text not null default 'paypal'
    check (payment_method in ('paypal', 'bank_transfer')),
  add column payment_proof_path text;

insert into storage.buckets (id, name, public) values ('payment-proofs', 'payment-proofs', false);

create policy "admin read payment proofs" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-proofs' and public.is_admin());
```

No se necesita política de escritura para `anon`/`authenticated`: la única
escritura la hace el servidor con el cliente de rol de servicio, que ignora
RLS. `payment_proof_path` queda `null` para pedidos de PayPal.

`OrderRow` (tipo TS) gana `payment_method: 'paypal' | 'bank_transfer'` y
`payment_proof_path: string | null`.

### Confirmación al cliente

`src/app/[locale]/checkout/confirmation/[orderId]/page.tsx` lee el query
param `method`. Si es `bank_transfer`, muestra "Tu pedido está en proceso"
(y su versión en inglés) en vez del "Gracias por tu compra" genérico
actual. El flujo de PayPal no manda este query param, así que su mensaje no
cambia.

### Revisión y aprobación en el admin

`src/app/admin/(protected)/orders/[id]/page.tsx` gana:

- Una línea mostrando el método de pago (`PayPal` / `Depósito bancario`).
- Cuando `payment_method === 'bank_transfer'` y hay
  `payment_proof_path`: la imagen del comprobante, cargada con una URL
  firmada (`supabase.storage.from('payment-proofs').createSignedUrl(...)`)
  — el bucket es privado, así que no hay URL pública que filtrar.
- Un botón **"Marcar como pagado"**, visible solo cuando
  `order.status === 'pending'` **y** `order.payment_method === 'bank_transfer'`
  (los pedidos de PayPal se confirman solos vía `capture-order`; este botón
  no debe poder usarse para saltarse esa verificación en un pedido de
  PayPal que quedó pendiente). Llama a una ruta nueva
  `POST /api/admin/orders/[id]/mark-paid`.
- El botón "Marcar como enviado" existente se deshabilita mientras el
  pedido siga en `pending` (evita marcar como enviado algo que nunca se
  confirmó como pagado).

`POST /api/admin/orders/[id]/mark-paid`:

- Usa el cliente de Supabase con la sesión del admin (cookies), no el de
  rol de servicio, para el `update` de `orders` — así la política RLS
  `admin update orders` (ya existente, basada en `is_admin()`) es quien
  decide si la petición procede, igual que cualquier otra escritura del
  panel admin.
- Antes de actualizar, verifica que el pedido tenga
  `payment_method = 'bank_transfer'` (rechaza con 400 si es un pedido de
  PayPal) — mismo motivo que ocultar el botón en la UI, pero exigido en el
  servidor, no solo en el cliente.
- Compare-and-swap igual que `capture-order`: solo actualiza si
  `status = 'pending'`, para que dos clics no dupliquen el efecto.
- Si el update tuvo efecto: descuenta stock por cada línea del pedido
  (`decrement_variant_stock`, igual que hace `capture-order` hoy) y envía
  el correo de confirmación al cliente (`sendOrderConfirmationEmail`).

Estos dos pasos (descontar stock + enviar confirmación) hoy solo existen
dentro de `capture-order/route.ts`. Se extraen a una función compartida
(p. ej. `finalizeOrderPayment(order, items)` en `src/lib/order-draft.ts` o
un módulo nuevo) para que `capture-order` y `mark-paid` no dupliquen esa
lógica — es la misma operación ("este pedido ya se cobró de verdad, ciérralo")
con dos disparadores distintos (PayPal confirma solo; depósito lo confirma
la administradora a mano).

## Fuera de alcance (explícito)

- Verificación automática del comprobante (OCR, matching de monto).
- Notificación por WhatsApp (el aviso a la administradora es solo por
  correo, como ya existe para PayPal).
- Depósito bancario para países fuera de las 4 zonas de Santo Domingo.
- Cambiar el campo "Ciudad" a un selector para países que no sean `DO`.
