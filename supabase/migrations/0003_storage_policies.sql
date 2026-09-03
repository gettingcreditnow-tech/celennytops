-- Write access to the `product-images` Storage bucket.
--
-- Marking the bucket "public" only makes objects publicly READABLE. Uploads
-- from the admin panel still go through row level security on storage.objects,
-- which denies everything by default - so without these policies
-- ProductForm's image upload fails for every admin.
--
-- Run this after creating the `product-images` bucket, and after
-- 0002_admin_allowlist.sql (which defines public.is_admin()).

create policy "admin read product images" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

create policy "admin insert product images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

create policy "admin update product images" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

create policy "admin delete product images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
