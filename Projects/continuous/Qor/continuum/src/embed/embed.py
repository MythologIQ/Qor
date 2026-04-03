import sys
import json
from transformers import AutoTokenizer, AutoModel
import torch

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModel.from_pretrained(MODEL_NAME)
model.eval()


def mean_pooling(model_output, attention_mask):
    token_embeddings = model_output[0]
    input_mask = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
    return torch.sum(token_embeddings * input_mask, 1) / torch.clamp(
        input_mask.sum(1), min=1e-9
    )


def embed(text: str) -> list[float]:
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=256, padding=True)
    with torch.no_grad():
        output = model(**inputs)
    embedding = mean_pooling(output, inputs["attention_mask"])
    embedding = torch.nn.functional.normalize(embedding, p=2, dim=1)
    return embedding.squeeze().tolist()


if __name__ == "__main__":
    text = sys.stdin.read().strip()
    if not text:
        print("[]")
    else:
        print(json.dumps(embed(text)))
