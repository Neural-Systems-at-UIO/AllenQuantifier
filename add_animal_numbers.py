import gzip
import json
import pandas as pd
import numpy as np

metadata = pd.read_csv("metadata.csv")
with gzip.open("data/gene_data.json.gz", "r") as f:
    output = json.load(f)
counts = []
for i in output["gene_name"]:
    counts.append((metadata["gene"] == i).sum())

output["number_of_animals"] = np.array(counts).astype(int).tolist()

index_names = output["gene_name"].index("Nothing")
for k, v in output.items():
    try:
        del v[index_names]
    except:
        None
output.keys()


def sort_dict(x):
    gene_name = x["gene_name"]
    number_of_animals = x["number_of_animals"]
    combined_list = list(zip(gene_name, number_of_animals))
    sorted_list = sorted(combined_list, key=lambda x: x[1], reverse=True)
    gene_name, number_of_animals = zip(*sorted_list)
    x["gene_name"] = list(gene_name)
    x["number_of_animals"] = list(number_of_animals)
    return x


output = sort_dict(output)
with gzip.open("data/gene_data_counts.json.gz", "wt") as f:
    json.dump(output, f, indent=4)
