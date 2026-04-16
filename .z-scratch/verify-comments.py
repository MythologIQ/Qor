import requests, json, re, time

API_KEY = "moltbook_sk_io96n9GQLCYl1jax1iar2EsmIflksPpK"
BASE = "https://www.moltbook.com/api/v1"
HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

# Fetch unverified comments by Qora
# Re-post to same posts to get fresh verification challenges, but actually
# let's just list Qora's recent comments and verify them

# The challenges decoded:
# 1. "thirty two newtons and fifteen newtons total force" = 32 + 15 = 47
# 2. "thirty five cm/s accelerates by twelve" = 35 + 12 = 47
# 3. "twenty eight cm/s decelerates by seven" = 28 - 7 = 21
# 4. "twenty three m/s loses seven" = 23 - 7 = 16
# 5. "twenty three m/s slows by seven" = 23 - 7 = 16
# 6. "thirty five newtons and twelve newtons total" = 35 + 12 = 47

# But we need the verification codes. Let me re-fetch from the posts
post_ids = [
    "aa2bfcc4-c61a-4334-baa8-f65286f338c3",
    "527075c5-647c-4fbf-ac66-b2aae09f3396",
    "53dc680b-0430-4fba-a234-9ba9eb5f3b63",
    "2a943a0b-e42f-4f7f-8738-477e304df302",
    "beb2a082-0393-4811-82b9-c7e15731416a",
    "8568b546-92b6-4949-afd4-a4c68df94533",
]

# Get comments for each post and find Qora's unverified ones
for pid in post_ids:
    resp = requests.get(f"{BASE}/posts/{pid}/comments?limit=5&sort=new", headers=HEADERS)
    data = resp.json()
    if not data.get("success"):
        print(f"Post {pid}: failed to fetch comments - {data}")
        continue
    
    comments = data.get("comments", [])
    for c in comments:
        author = c.get("author", {})
        if author.get("name") == "qora" and c.get("verification_status") == "pending":
            v = c.get("verification", {})
            code = v.get("verification_code", "")
            challenge = v.get("challenge_text", "")
            
            # Decode the obfuscated challenge
            clean = re.sub(r'[^a-zA-Z0-9\s,.]', '', challenge).lower()
            clean = ' '.join(clean.split())
            print(f"\nPost: {pid[:8]}...")
            print(f"  Clean challenge: {clean}")
            
            # Parse word-numbers
            word_to_num = {
                'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
                'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
                'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
                'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17,
                'eighteen': 18, 'nineteen': 19, 'twenty': 20, 'thirty': 30,
                'forty': 40, 'fifty': 50
            }
            
            # Find all number words in sequence
            words = clean.split()
            numbers = []
            i = 0
            while i < len(words):
                w = words[i]
                if w in word_to_num:
                    val = word_to_num[w]
                    # Check for compound like "thirty two"
                    if i + 1 < len(words) and words[i+1] in word_to_num and word_to_num[words[i+1]] < 10:
                        val += word_to_num[words[i+1]]
                        i += 1
                    numbers.append(val)
                i += 1
            
            print(f"  Numbers found: {numbers}")
            
            # Determine operation from context
            if len(numbers) >= 2:
                if any(w in clean for w in ['total', 'adds', 'plus', 'accelerat', 'sum']):
                    ans = numbers[0] + numbers[1]
                    op = "add"
                elif any(w in clean for w in ['loses', 'slow', 'decelerat', 'minus', 'subtract']):
                    ans = numbers[0] - numbers[1]
                    op = "subtract"
                elif any(w in clean for w in ['times', 'multiply', 'product']):
                    ans = numbers[0] * numbers[1]
                    op = "multiply"
                else:
                    ans = numbers[0] + numbers[1]
                    op = "add (default)"
                
                answer_str = f"{ans:.2f}"
                print(f"  Operation: {op}, Answer: {answer_str}")
                
                vr = requests.post(f"{BASE}/verify", headers=HEADERS, 
                                   json={"verification_code": code, "answer": answer_str})
                vd = vr.json()
                print(f"  Result: {vd.get('success')} - {vd.get('message', '')}")
            else:
                print(f"  Not enough numbers parsed")
    
    time.sleep(0.5)

print("\n=== VERIFICATION COMPLETE ===")
