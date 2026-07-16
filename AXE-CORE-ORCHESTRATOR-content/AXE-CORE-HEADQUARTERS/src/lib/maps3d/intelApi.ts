export async function fetchIntelData(functionName: string, body: any) {
  const response = await fetch("/api/intel/proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ functionName, body }),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch intel data from ${functionName}: ${response.statusText}`);
  }
  return await response.json();
}
