# Runtime data directory

ThirdWatch writes generated source data, reconciliation results, audit trails, accuracy reports, and exception reports here.

The JSON and CSV files supplied in this repository are deterministic synthetic fixtures. Never commit real merchant, customer, settlement, or banking data. Release packaging and Docker build contexts exclude this directory to prevent runtime financial artifacts from entering distributed archives or container layers.
