import chromadb

# 1. Connect to the local database folder we just created
client = chromadb.PersistentClient(path="./chroma_db")

# 2. Get our specific collection
collection = client.get_collection(name="pdf_documents")

# 3. Print out some basic stats
print(f"Total chunks stored: {collection.count()}")

# 4. 'Peek' at the first 2 chunks to see what they look like
print("\n--- Peeking at the first 2 chunks ---")
peek_data = collection.peek(limit=2)

# We can print the actual text (documents) and the metadata
for i in range(len(peek_data['ids'])):
    print(f"\nID: {peek_data['ids'][i]}")
    print(f"Metadata: {peek_data['metadatas'][i]}")
    print(f"Text Preview: {peek_data['documents'][i][:100]}...") # Just printing the first 100 characters