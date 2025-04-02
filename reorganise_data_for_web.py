import pandas as pd
import json
import gzip
metadata = pd.read_csv(r"metadata.csv")
gene_list = metadata['gene'].unique().tolist()
with gzip.open('gene_list.json.gz', 'wt') as f:
    json.dump(gene_list, f)