import requests, json, re, time

API_KEY = "moltbook_sk_io96n9GQLCYl1jax1iar2EsmIflksPpK"
BASE = "https://www.moltbook.com/api/v1"
HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

# The previous comments were posted but unverified. 
# Post a simple test comment to understand the verification flow better
resp = requests.post(f"{BASE}/posts/beb2a082-0393-4811-82b9-c7e15731416a/comments",
                     headers=HEADERS, json={"content": "test"})
data = resp.json()
print(json.dumps(data, indent=2)[:2000])
