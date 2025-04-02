document.addEventListener('DOMContentLoaded', function() {
    // Set current year in footer
    
    // DOM elements
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const resultsList = document.getElementById('resultsList');
    const resultCount = document.getElementById('resultCount');
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    // Pagination variables
    const itemsPerPage = 10;
    let currentPage = 1;
    let filteredData = [];
    let fileData = [];
    
    // Load and parse the JSON.gz file
    async function loadFileData() {
        try {
            console.log("Starting data load...");
            loadingIndicator.style.display = 'flex';
            resultsList.style.display = 'none';
            
            const response = await fetch('data/gene_data.json.gz');
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
                ensembl_ids: rawData.ensembl_ids[index] || []
            }));
            
            console.log("First gene object:", fileData[0]);
            console.log("Total genes:", fileData.length);
            
            filteredData = [...fileData];
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
        
        paginatedItems.forEach(gene => {
            const li = document.createElement('li');
            li.className = 'result-item';
            
            // Create the single link for the entire card
            const filePath = `/genes/${encodeURIComponent(gene.gene_name)}.txt`; // or your preferred file type
            
            li.innerHTML = `
                <a href="${filePath}" target="_blank" class="result-link">
                    <div class="result-header">
                        <i class="fas fa-dna"></i>
                        <div class="result-title">
                            <h3 class="gene-name">${gene.gene_name}</h3>
                            <p class="gene-description">${gene.gene_description || 'No description available'}</p>
                        </div>
                        <i class="fas fa-external-link-alt link-icon"></i>
                    </div>
                    
                    <div class="gene-meta">
                        ${gene.synonyms && gene.synonyms.length ? `
                        <div class="meta-section">
                            <span class="meta-label">Synonyms:</span>
                            <span class="meta-value">${Array.isArray(gene.synonyms) ? gene.synonyms.join(', ') : gene.synonyms}</span>
                        </div>
                        ` : ''}
                        
                        ${gene.ensembl_ids ? `
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
    function addPaginationControls() {
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);
        
        if (totalPages <= 1) return;
        
        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'pagination';
        
        // Previous button
        const prevButton = document.createElement('button');
        prevButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
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
        nextButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
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
    
    // Search function
    function searchFiles(query) {
        console.group("Search Execution");
        try {
            currentPage = 1;
            const lowerQuery = query.toLowerCase().trim();
            console.log("Search query:", `"${lowerQuery}"`);
            
            if (!lowerQuery) {
                console.log("Empty query - showing all results");
                filteredData = [...fileData];
            } else {
                console.log("Filtering data...");
                filteredData = fileData.filter(gene => {
                    // Search in multiple fields
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
            
            displayResults();
        } catch (error) {
            console.error("Search error:", error);
        } finally {
            console.groupEnd();
        }
    }
    // Event listeners for search
    searchButton.addEventListener('click', () => {
        searchFiles(searchInput.value);
    });
    
    searchInput.addEventListener('input', () => {
        searchFiles(searchInput.value);
    });
    
    // Initial load
    loadFileData();
});