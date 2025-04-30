document.addEventListener('DOMContentLoaded', function () {
    // DOM elements
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const resultsList = document.getElementById('resultsList');
    const resultCount = document.getElementById('resultCount');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const structureSelect = document.getElementById('structureSelect');
    const metricSelect = document.getElementById('metricSelect');
    const sortOrder = document.getElementById('sortOrder');
    const structureLabel = document.getElementById('structureLabel');
    const metricLabel = document.getElementById('metricLabel');

    // Pagination variables
    const itemsPerPage = 10;
    let currentPage = 1;
    let filteredData = [];
    let fileData = [];
    let structureData = {};
    let structuresList = [];

    // Toggle structure/metric controls based on sort selection
    function toggleStructureControls() {
        const isStructureSort = document.querySelector('input[name="sortBy"][value="structure"]').checked;
        structureSelect.disabled = !isStructureSort;
        metricSelect.disabled = !isStructureSort;
        structureLabel.classList.toggle('disabled', !isStructureSort);
        metricLabel.classList.toggle('disabled', !isStructureSort);
    }

    // Load structures list
    async function loadStructuresList() {
        try {
            const response = await fetch('data/structure_names.json.gz');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const compressedData = await response.arrayBuffer();
            const decompressedData = pako.inflate(compressedData, { to: 'string' });
            structuresList = JSON.parse(decompressedData);

            // Populate structure dropdown
            structureSelect.innerHTML = '';

            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Select a structure...';
            structureSelect.appendChild(defaultOption);

            structuresList.forEach(structure => {
                const option = document.createElement('option');
                option.value = structure;
                option.textContent = structure;
                structureSelect.appendChild(option);
            });

            setTimeout(() => {
                $(structureSelect).select2({
                    placeholder: "Search for a structure...",
                    allowClear: false,
                    width: '100%',
                    dropdownAutoWidth: true,
                    minimumResultsForSearch: 1,
                    dropdownParent: $('.search-container')
                });

                $(structureSelect).on('change', async function () {
                    await updateGeneMetrics();
                });
            }, 100);

            if (structuresList.length > 0) {
                setTimeout(() => {
                    $(structureSelect).val(structuresList[0]).trigger('change');
                    updateGeneMetrics();
                }, 200);
            }
        } catch (error) {
            console.error('Error loading structures list:', error);
        }
    }

    async function loadStructureData(structure, metric) {
        if (!structure) return {};

        try {
            const safeStructureName = structure.replace(/[\\/]/g, '_');
            const response = await fetch(`data/${safeStructureName}_${metric}.json.gz`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const compressedData = await response.arrayBuffer();
            const decompressedData = pako.inflate(compressedData, { to: 'string' });
            return JSON.parse(decompressedData);
        } catch (error) {
            console.error(`Error loading ${metric} data for ${structure}:`, error);
            return {};
        }
    }

    function addPaginationControls() {
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);

        const existingPagination = document.querySelector('.pagination');
        if (existingPagination) {
            existingPagination.remove();
        }

        if (filteredData.length === 0 || totalPages <= 1) return;

        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'pagination';

        const prevButton = document.createElement('button');
        prevButton.innerHTML = '<i class="fas fa-chevron-left"></i> Previous';
        prevButton.disabled = currentPage === 1;
        prevButton.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                displayResults();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });

        const pageInfo = document.createElement('span');
        pageInfo.className = 'page-info';
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

        const nextButton = document.createElement('button');
        nextButton.innerHTML = 'Next <i class="fas fa-chevron-right"></i>';
        nextButton.disabled = currentPage === totalPages;
        nextButton.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                displayResults();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });

        paginationContainer.appendChild(prevButton);
        paginationContainer.appendChild(pageInfo);
        paginationContainer.appendChild(nextButton);

        resultsList.appendChild(paginationContainer);
    }

    async function loadFileData() {
        try {
            console.log("Starting data load...");
            loadingIndicator.style.display = 'flex';
            resultsList.style.display = 'none';

            const response = await fetch('data/gene_data_counts.json.gz');
            console.log("Fetch response status:", response.status);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const compressedData = await response.arrayBuffer();
            console.log("Got compressed data, length:", compressedData.byteLength);

            const decompressedData = pako.inflate(compressedData, { to: 'string' });
            console.log("Decompressed data length:", decompressedData.length);

            const rawData = JSON.parse(decompressedData);
            console.log("Parsed JSON data keys:", Object.keys(rawData));

            fileData = rawData.gene_name.map((name, index) => ({
                gene_name: name,
                gene_description: rawData.gene_description[index],
                synonyms: rawData.synonyms[index] || [],
                ensembl_ids: rawData.ensembl_ids[index] || [],
                number_of_animals: rawData.number_of_animals[index] || 0,
                specificity: 0,
                intensity: 0,
                expression_pct: 0,
                expression_specificity: 0
            }));

            console.log("First gene object:", fileData[0]);
            console.log("Total genes:", fileData.length);

            filteredData = [...fileData];
            sortResults();
            displayResults();
            loadingIndicator.style.display = 'none';

        } catch (error) {
            console.error('Full error:', error);
            loadingIndicator.innerHTML = `
                <p class="error">Failed to load data</p>
                <p>${error.message}</p>
                <p>Check console for details</p>
            `;
        }
    }

    function sortResults() {
        const selectedStructure = structureSelect.value;
        const selectedMetric = metricSelect.value;
        const isDescending = sortOrder.value === 'desc';
        const sortBy = document.querySelector('input[name="sortBy"]:checked').value;

        filteredData.sort((a, b) => {
            let valA, valB;

            if (sortBy === 'structure' && selectedStructure) {
                valA = a[selectedMetric] || 0;
                valB = b[selectedMetric] || 0;
            } else {
                valA = a.number_of_animals;
                valB = b.number_of_animals;
            }

            return isDescending ? valB - valA : valA - valB;
        });
    }

    function displayResults() {
        console.log("Displaying results. Total:", filteredData.length);

        resultsList.style.display = 'block';
        loadingIndicator.style.display = 'none';
        resultsList.innerHTML = '';
        resultCount.textContent = filteredData.length;

        if (filteredData.length === 0) {
            resultsList.innerHTML = '<li class="result-item no-results">No matching genes found. Try a different search term.</li>';
            return;
        }

        const startIndex = (currentPage - 1) * itemsPerPage;
        const paginatedItems = filteredData.slice(startIndex, startIndex + itemsPerPage);
        const selectedStructure = structureSelect.value;
        const isStructureSort = document.querySelector('input[name="sortBy"][value="structure"]').checked;

        paginatedItems.forEach(gene => {
            const li = document.createElement('li');
            li.className = 'result-item';
            const filePath = `https://atlases.ebrains.eu/viewer-staging/#/a:juelich:iav:atlas:v1.0.0:2/t:minds:core:referencespace:v1.0.0:265d32a0-3d84-40a5-926f-bf89f68212b9/p:minds:core:parcellationatlas:v1.0.0:05655b58-3b6f-49db-b285-64b5a0276f83/x-overlay-layer:nifti:%2F%2Fhttps:%2F%2Fdata-proxy.ebrains.eu%2Fapi%2Fv1%2Fbuckets%2Fdeepslice%2Fexpression_volumes%2F${encodeURIComponent(gene.gene_name)}_interp_25um.nii.gz`;

            // Always include metrics in the DOM but control visibility with class
            const specificityValue = gene.specificity ? gene.specificity.toFixed(3) : 'N/A';
            const intensityValue = gene.intensity ? gene.intensity.toFixed(3) : 'N/A';
            const expressionPctValue = gene.expression_pct ? (gene.expression_pct * 100).toFixed(1) + '%' : 'N/A';
            const expressionSpecValue = gene.expression_specificity ? gene.expression_specificity.toFixed(3) : 'N/A';

            li.innerHTML = `
                <a href="${filePath}" target="_blank" class="result-link">
                    <div class="result-header">
                        <i class="fas fa-dna"></i>
                        <div class="result-title">
                            <h3 class="gene-name">${gene.gene_name}</h3>
                            <p class="gene-description">${gene.gene_description || 'No description available'}</p>
                        </div>
                        <div class="mouse-count">
                            <i class="fas fa-paw"></i>
                            <span>${gene.number_of_animals} mice</span>
                        </div>
                        <i class="fas fa-external-link-alt link-icon"></i>
                    </div>
                    
                    <div class="metric-values">
           
                        <div class="metric-value">
                            <span class="metric-label">Specificity of Coverage:</span>
                            <span class="metric-number">${expressionSpecValue}</span>
                        </div>
                                  <div class="metric-value">
                            <span class="metric-label">Coverage:</span>
                            <span class="metric-number">${expressionPctValue}</span>
                        </div>
         
                        <div class="metric-value">
                            <span class="metric-label">Specificity of Intensity:</span>
                            <span class="metric-number">${specificityValue}</span>
                        </div>
                                       <div class="metric-value">
                            <span class="metric-label">Intensity:</span>
                            <span class="metric-number">${intensityValue}</span>
                        </div>
   
                    </div>
                    
                    <div class="gene-meta">
                        ${gene.synonyms && gene.synonyms.length ? `
                        <div class="meta-section">
                            <span class="meta-label">Synonyms:</span>
                            <span class="meta-value">${Array.isArray(gene.synonyms) ? gene.synonyms.join(', ') : gene.synonyms}</span>
                        </div>
                        ` : ''}
                        
                        ${gene.ensembl_ids && gene.ensembl_ids.length ? `
                        <div class="meta-section">
                            <span class="meta-label">Ensembl IDs:</span>
                            <span class="meta-value">${Array.isArray(gene.ensembl_ids) ? gene.ensembl_ids.join(', ') : gene.ensembl_ids}</span>
                        </div>
                        ` : ''}
                    </div>
                </a>
            `;

            // Toggle metrics visibility without affecting layout
            if (isStructureSort && selectedStructure) {
                li.classList.add('show-metrics');
            } else {
                li.classList.remove('show-metrics');
            }

            resultsList.appendChild(li);
        });

        addPaginationControls();
    }
    async function updateGeneMetrics() {
        const structure = structureSelect.value;

        if (!structure) {
            fileData.forEach(gene => {
                gene.specificity = 0;
                gene.intensity = 0;
                gene.expression_pct = 0;
                gene.expression_specificity = 0;
                gene.inStructure = true;
            });
            return;
        }

        loadingIndicator.style.display = 'flex';

        try {
            const [specificityData, intensityData, expressionPctData, expressionSpecData] = await Promise.all([
                loadStructureData(structure, 'specificity'),
                loadStructureData(structure, 'intensity'),
                loadStructureData(structure, 'expression_pct'),
                loadStructureData(structure, 'expression_specificity')
            ]);

            fileData.forEach(gene => {
                if (specificityData.hasOwnProperty(gene.gene_name)) {
                    gene.specificity = specificityData[gene.gene_name] || 0;
                    gene.intensity = intensityData[gene.gene_name] || 0;
                    gene.expression_pct = expressionPctData[gene.gene_name] || 0;
                    gene.expression_specificity = expressionSpecData[gene.gene_name] || 0;
                    gene.inStructure = true;
                } else {
                    gene.specificity = 0;
                    gene.intensity = 0;
                    gene.expression_pct = 0;
                    gene.expression_specificity = 0;
                    gene.inStructure = false;
                }
            });

            searchFiles(searchInput.value);
        } catch (error) {
            console.error('Error updating gene metrics:', error);
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }

    function searchFiles(query) {
        console.group("Search Execution");
        try {
            currentPage = 1;
            const lowerQuery = query.toLowerCase().trim();
            const selectedStructure = structureSelect.value;
            console.log("Search query:", `"${lowerQuery}"`);

            if (!lowerQuery) {
                console.log("Empty query - showing all results");
                filteredData = fileData.filter(gene => {
                    return !selectedStructure || gene.inStructure;
                });
            } else {
                console.log("Filtering data...");
                filteredData = fileData.filter(gene => {
                    if (selectedStructure && !gene.inStructure) {
                        return false;
                    }

                    const searchFields = [
                        gene.gene_name,
                        gene.gene_description,
                        ...(Array.isArray(gene.synonyms) ? gene.synonyms : [gene.synonyms]),
                        ...(Array.isArray(gene.ensembl_ids) ? gene.ensembl_ids : [gene.ensembl_ids])
                    ].filter(Boolean).map(f => String(f).toLowerCase());

                    return searchFields.some(field => field.includes(lowerQuery));
                });
                console.log(`Found ${filteredData.length} matches`);
            }

            sortResults();
            displayResults();
        } catch (error) {
            console.error("Search error:", error);
        } finally {
            console.groupEnd();
        }
    }

    // Event listeners
    searchButton.addEventListener('click', () => {
        searchFiles(searchInput.value);
    });

    searchInput.addEventListener('input', () => {
        searchFiles(searchInput.value);
    });

    document.querySelectorAll('input[name="sortBy"]').forEach(radio => {
        radio.addEventListener('change', () => {
            toggleStructureControls();
            sortResults();
            displayResults();
        });
    });

    structureSelect.addEventListener('change', async () => {
        await updateGeneMetrics();
    });

    metricSelect.addEventListener('change', () => {
        sortResults();
        displayResults();
    });

    sortOrder.addEventListener('change', () => {
        sortResults();
        displayResults();
    });
    const metricsInfoButton = document.getElementById('metricsInfoButton');
    const metricsInfoBox = document.getElementById('metricsInfoBox');
    const closeInfoBox = document.getElementById('closeInfoBox');

    metricsInfoButton.addEventListener('click', () => {
        metricsInfoBox.style.display = 'block';
    });

    closeInfoBox.addEventListener('click', () => {
        metricsInfoBox.style.display = 'none';
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!metricsInfoBox.contains(e.target) && e.target !== metricsInfoButton) {
            metricsInfoBox.style.display = 'none';
        }
    });

    // Initial load
    toggleStructureControls();
    loadStructuresList();
    loadFileData();
});