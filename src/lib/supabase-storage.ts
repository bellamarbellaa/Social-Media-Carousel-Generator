function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!url) throw new Error("SUPABASE_URL is not set");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  if (!bucket) throw new Error("SUPABASE_STORAGE_BUCKET is not set");
  return { url, serviceRoleKey, bucket };
}

/** Uploads a PNG buffer to the configured public Supabase Storage bucket and returns its public URL. */
export async function uploadImage(buffer: Buffer, path: string): Promise<string> {
  const { url, serviceRoleKey, bucket } = getSupabaseConfig();

  const response = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      // Supabase's newer sb_secret_... keys aren't JWTs, so Storage needs
      // them on the "apikey" header too — Authorization alone gets rejected
      // with "Invalid Compact JWS".
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "image/png",
      "x-upsert": "true",
    },
    body: buffer,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase Storage upload of ${path} failed with status ${response.status}: ${body}`);
  }

  return `${url}/storage/v1/object/public/${bucket}/${path}`;
}
