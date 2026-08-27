import os
import requests
from dotenv import load_dotenv

# Load the API key from your .env file
load_dotenv()
api_key = os.getenv("GROQ_API_KEY")

if not api_key:
    print("Error: GROQ_API_KEY not found in .env")
    exit()

# Ask Groq which models this API key can use
url = "https://api.groq.com/openai/v1/models"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)
data = response.json()

print("\n=== MODELS AVAILABLE ON YOUR GROQ ACCOUNT ===")
if "data" in data:
    for model in data["data"]:
        print(f"- {model['id']}")
else:
    print("Error fetching models:", data)