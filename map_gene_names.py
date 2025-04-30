import pandas as pd
import requests
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor
import json
import gzip

metadata = pd.read_csv(r"metadata.csv")
genes = metadata["gene"].unique().tolist()


def get_synonyms(symbol):
    species = "mus_musculus"
    url = f"https://rest.ensembl.org/xrefs/name/{species}/{symbol}"
    headers = {"Content-Type": "application/json"}
    response = requests.get(url, headers=headers)
    if response.ok:
        data = response.json()
        synonyms = set()
        for entry in data:
            synonyms.update(entry.get("synonyms", []))
        if len(data) == 0:
            return None, None
        return synonyms, data[0]["description"]
    else:
        print("Request failed:", response.status_code)


def get_ensembl(symbol):
    species = "mus_musculus"
    url = f"https://rest.ensembl.org/xrefs/symbol/{species}/{symbol}"
    headers = {"Content-Type": "application/json"}
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        results = response.json()
        if len(results) == 0:
            return None
        return results[0]["id"]
    else:
        print("Request failed:", response.status_code)
        return None


synonym_list = []
ensembl_list = []
description_list = []
gene = [genes[0]]
for gene in tqdm(genes[genes.index(gene) :]):
    synonyms, description = get_synonyms(gene)
    ensembl = get_ensembl(gene)
    synonym_list.append(synonyms)
    ensembl_list.append(ensembl)
    description_list.append(description)


synonym_list = [list(i) if i is not None else [] for i in synonym_list]

output = {
    "gene_name": genes,
    "gene_description": description_list,
    "synonyms": synonym_list,
    "ensembl_ids": ensembl_list,
}


with gzip.open("data/gene_data.json.gz", "wt") as f:
    json.dump(output, f, indent=4)


for k in output.keys():
    print(k, len(output[k]))
