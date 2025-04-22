document.addEventListener('DOMContentLoaded', function() {
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
            structureSelect.innerHTML = ''; // Clear existing options
            
            // Add a default empty option (optional)
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
            
            // Initialize Select2 after a small delay to ensure DOM is ready
            setTimeout(() => {
                $(structureSelect).select2({
                    placeholder: "Search for a structure...",
                    allowClear: false,
                    width: '100%',
                    dropdownAutoWidth: true,
                    minimumResultsForSearch: 1,
                    dropdownParent: $('.search-container') // Add this line
                });
                
                // Handle Select2 change event
                $(structureSelect).on('change', async function() {
                    await updateGeneMetrics();
                });
            }, 100);
            
            if (structuresList.length > 0) {
                // Select first structure by default if needed
                setTimeout(() => {
                    $(structureSelect).val(structuresList[0]).trigger('change');
                    updateGeneMetrics(); // Load data for the first structure
                }, 200);
            }
        } catch (error) {
            console.error('Error loading structures list:', error);
        }
    }
    // Load structure-specific data when selected
        // Modified loadStructureData function to handle formatted names
        async function loadStructureData(structure, metric) {
            if (!structure) return {};
            
            try {
                // Create safe filename by replacing slashes/backslashes
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
    // Add Pagination Controls function
    function addPaginationControls() {
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);
        
        // Remove any existing pagination controls
        const existingPagination = document.querySelector('.pagination');
        if (existingPagination) {
            existingPagination.remove();
        }
        // Add this to your event listeners section

        // Don't show pagination if no results or only one page
        if (filteredData.length === 0 || totalPages <= 1) return;
        
        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'pagination';
        
        // Previous button
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
        
        // Page info
        const pageInfo = document.createElement('span');
        pageInfo.className = 'page-info';
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        
        // Next button
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
    
    // Modified loadFileData function
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
            
            // Convert parallel arrays to array of gene objects
            fileData = rawData.gene_name.map((name, index) => ({
                gene_name: name,
                gene_description: rawData.gene_description[index],
                synonyms: rawData.synonyms[index] || [],
                ensembl_ids: rawData.ensembl_ids[index] || [],
                number_of_animals: rawData.number_of_animals[index] || 0,
                // Initialize structure-specific metrics
                specificity: 0,
                intensity: 0
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
                // Sort by the selected structure metric
                valA = a[selectedMetric] || 0;
                valB = b[selectedMetric] || 0;
            } else {
                // Default sort by number of animals
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
            const filePath = `https://atlases.ebrains.eu/viewer-staging/#/a:juelich:iav:atlas:v1.0.0:2/t:minds:core:referencespace:v1.0.0:265d32a0-3d84-40a5-926f-bf89f68212b9/p:minds:core:parcellationatlas:v1.0.0:05655b58-3b6f-49db-b285-64b5a0276f83/x-overlay-layer:nifti:%2F%2Fhttps:%2F%2Fdata-proxy.ebrains.eu%2Fapi%2Fv1%2Fbuckets%2Fdeepslice%2Fgene_volumes%2F${encodeURIComponent(gene.gene_name)}_interp_25um.nii.gz`;
            
            // Only show metrics when sorting by structure
            let metricDisplay = '';
            if (isStructureSort && selectedStructure) {
                const specificityValue = gene.specificity ? gene.specificity.toFixed(3) : 'N/A';
                const intensityValue = gene.intensity ? gene.intensity.toFixed(3) : 'N/A';
                metricDisplay = `
                    <div class="metric-values">
                        <div class="metric-value">
                            <span class="metric-label">Specificity:</span>
                            <span class="metric-number">${specificityValue}</span>
                        </div>
                        <div class="metric-value">
                            <span class="metric-label">Intensity:</span>
                            <span class="metric-number">${intensityValue}</span>
                        </div>
                    </div>
                `;
            }
            
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
                        ${metricDisplay}
                        <i class="fas fa-external-link-alt link-icon"></i>
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
            
            resultsList.appendChild(li);
        });
        
        addPaginationControls();
    }
    
    async function updateGeneMetrics() {
        const structure = structureSelect.value;
        const metric = metricSelect.value;
        
        if (!structure) {
            // Reset metrics if no structure selected
            fileData.forEach(gene => {
                gene.specificity = 0;
                gene.intensity = 0;
                gene.inStructure = true; // Flag all genes as valid when no structure is selected
            });
            return;
        }
        
        loadingIndicator.style.display = 'flex';
        
        try {
            // Load both specificity and intensity data for the selected structure
            const specificityData = await loadStructureData(structure, 'specificity');
            const intensityData = await loadStructureData(structure, 'intensity');
            console.log('intensityData')
            console.log(intensityData)
            // Update gene data with metrics and set inStructure flag
            fileData.forEach(gene => {
                if (specificityData.hasOwnProperty(gene.gene_name)) {
                    gene.specificity = specificityData[gene.gene_name] || 0;
                    gene.intensity = intensityData[gene.gene_name] || 0;
                    gene.inStructure = true;
                } else {
                    gene.specificity = 0;
                    gene.intensity = 0;
                    gene.inStructure = false;
                }
            });
            
            // Re-filter and sort
            searchFiles(searchInput.value);
            
        } catch (error) {
            console.error('Error updating gene metrics:', error);
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }
    // Modified search function to consider structure presence
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
                    // If a structure is selected, only include genes present in that structure
                    return !selectedStructure || gene.inStructure;
                });
            } else {
                console.log("Filtering data...");
                filteredData = fileData.filter(gene => {
                    // First check if gene is in structure (if a structure is selected)
                    if (selectedStructure && !gene.inStructure) {
                        return false;
                    }
                    
                    // Then check search criteria
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

// Single event listener for sortBy radio buttons
document.querySelectorAll('input[name="sortBy"]').forEach(radio => {
    radio.addEventListener('change', () => {
        toggleStructureControls();
        sortResults();
        displayResults();
    });
});

// Listen for changes in structure, metric, or sort order
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

// Initial load
toggleStructureControls(); // Set initial disabled state
loadStructuresList();
loadFileData();
});