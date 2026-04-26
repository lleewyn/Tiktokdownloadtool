// Using global variables from CDN (axios, JSZip, saveAs)

const startBtn = document.getElementById('start-btn');
const clearBtn = document.getElementById('clear-btn');
const linksArea = document.getElementById('links');
const progressSection = document.getElementById('progress-section');
const progressBar = document.getElementById('progress-bar');
const progressStatus = document.getElementById('progress-status');
const progressPercent = document.getElementById('progress-percent');
const itemList = document.getElementById('item-list');
const downloadAllContainer = document.getElementById('download-all-container');
const zipBtn = document.getElementById('zip-btn');

const historyBtn = document.getElementById('history-btn');
const searchContainer = document.getElementById('search-container');
const searchInput = document.getElementById('search-input');

let videosToDownload = [];
let allProcessedVideos = []; // For search and history

startBtn.addEventListener('click', async () => {
    const rawLinks = linksArea.value.trim().split('\n').map(l => l.trim()).filter(l => l !== '');
    
    if (rawLinks.length === 0) {
        alert('Vui lòng nhập ít nhất 1 link TikTok!');
        return;
    }

    if (rawLinks.length > 50) {
        alert('Tối đa 50 link 1 lần để đảm bảo tốc độ.');
        // Optional: truncate
    }

    // Reset UI
    startBtn.disabled = true;
    progressSection.style.display = 'block';
    downloadAllContainer.style.display = 'none';
    itemList.innerHTML = '';
    videosToDownload = [];
    updateProgress(0, rawLinks.length);

    // Process links
    for (let i = 0; i < rawLinks.length; i++) {
        let url = rawLinks[i];
        // Clean URL: remove query parameters
        url = url.split('?')[0];
        
        const itemEl = createItemElement(url);
        itemList.appendChild(itemEl);
        
        try {
            updateStatus(itemEl, 'loading');
            
            // Using TikWM API via POST which is more stable
            const formData = new FormData();
            formData.append('url', url);
            formData.append('hd', '1');

            const response = await axios.post('https://www.tikwm.com/api/', formData);
            
            if (response.data && response.data.code === 0) {
                const videoData = response.data.data;
                const downloadUrl = videoData.play;
                const title = videoData.title || `tiktok_${videoData.id}`;
                const cover = videoData.cover;
                
                const videoObj = {
                    url: downloadUrl,
                    originalUrl: url,
                    filename: `${title.substring(0, 30)}.mp4`,
                    title: title,
                    cover: cover,
                    id: videoData.id
                };
                
                videosToDownload.push(videoObj);
                allProcessedVideos.push(videoObj);
                
                updateStatus(itemEl, 'success', downloadUrl, title, cover);
            } else {
                // Try fallback API: Tiklydown
                const fallbackRes = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`);
                if (fallbackRes.data && fallbackRes.data.video) {
                    const videoData = fallbackRes.data;
                    const dlUrl = videoData.video.noWatermark;
                    const title = videoData.title || `tiktok_${videoData.id}`;
                    const cover = videoData.author.avatar; // Use avatar as fallback cover

                    const videoObj = {
                        url: dlUrl,
                        originalUrl: url,
                        filename: `tiktok_${videoData.id}.mp4`,
                        title: title,
                        cover: cover,
                        id: videoData.id
                    };
                    videosToDownload.push(videoObj);
                    allProcessedVideos.push(videoObj);
                    updateStatus(itemEl, 'success', dlUrl, title, cover);
                } else {
                    throw new Error(response.data.msg || 'Không tìm thấy video');
                }
            }
        } catch (error) {
            console.error('Error processing link:', url, error);
            updateStatus(itemEl, 'error');
        }

        updateProgress(i + 1, rawLinks.length);
        
        // Small delay to prevent rate limit
        await new Promise(r => setTimeout(r, 500));
    }

    startBtn.disabled = false;
    
    if (videosToDownload.length > 0) {
        downloadAllContainer.style.display = 'block';
        searchContainer.style.display = 'block';
        progressStatus.innerText = 'Hoàn tất! Bạn có thể tải toàn bộ file ZIP.';
        saveToHistory(allProcessedVideos);
    } else {
        progressStatus.innerText = 'Không có video nào được xử lý thành công.';
    }
});

// Search Logic
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const items = itemList.querySelectorAll('.video-item');
    items.forEach(item => {
        const title = item.querySelector('.item-title').innerText.toLowerCase();
        const url = item.querySelector('.item-url').innerText.toLowerCase();
        if (title.includes(term) || url.includes(term)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
});

// History Logic
historyBtn.addEventListener('click', () => {
    const history = JSON.parse(localStorage.getItem('tk_history') || '[]');
    if (history.length === 0) {
        alert('Chưa có lịch sử tải xuống.');
        return;
    }
    
    progressSection.style.display = 'block';
    searchContainer.style.display = 'block';
    itemList.innerHTML = '';
    allProcessedVideos = history;
    
    history.forEach(video => {
        const itemEl = createItemElement(video.originalUrl);
        itemList.appendChild(itemEl);
        updateStatus(itemEl, 'success', video.url, video.title, video.cover);
    });
    
    progressStatus.innerText = 'Đã tải lịch sử từ bộ nhớ.';
});

function saveToHistory(newVideos) {
    const history = JSON.parse(localStorage.getItem('tk_history') || '[]');
    // Add only new ones, avoid duplicates by originalUrl
    const updatedHistory = [...newVideos, ...history].filter((v, i, a) => 
        a.findIndex(t => t.originalUrl === v.originalUrl) === i
    ).slice(0, 100); // Keep last 100
    localStorage.setItem('tk_history', JSON.stringify(updatedHistory));
}

zipBtn.addEventListener('click', async () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile && videosToDownload.length > 10) {
        if (!confirm('Bạn đang dùng điện thoại, việc nén file ZIP quá lớn có thể gây lỗi trình duyệt. Bạn nên tải lẻ từng video hoặc giảm số lượng link. Vẫn tiếp tục?')) {
            return;
        }
    }

    zipBtn.disabled = true;
    zipBtn.innerText = 'Đang nén file (Vui lòng chờ)...';
    
    const zip = new JSZip();
    const folder = zip.folder("tiktok_videos");

    let count = 0;
    const total = videosToDownload.length;
    const batchSize = 5; // Download 5 videos at a time
    
    for (let i = 0; i < total; i += batchSize) {
        const batch = videosToDownload.slice(i, i + batchSize);
        zipBtn.innerText = `Đang tải video ${i + 1}-${Math.min(i + batchSize, total)}/${total}...`;
        
        await Promise.all(batch.map(async (video) => {
            const itemEls = itemList.querySelectorAll('.video-item');
            let currentTitle = video.title;
            itemEls.forEach(el => {
                if (el.querySelector('.item-url').innerText === video.originalUrl) {
                    currentTitle = el.querySelector('.item-title').innerText;
                }
            });

            let blobData = null;
            const proxies = [
                `https://corsproxy.io/?${encodeURIComponent(video.url)}`,
                `https://api.allorigins.win/raw?url=${encodeURIComponent(video.url)}`,
                `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(video.url)}`
            ];

            for (const proxyUrl of proxies) {
                try {
                    const response = await fetch(proxyUrl);
                    if (!response.ok) throw new Error('Network response was not ok');
                    const blob = await response.blob();
                    
                    if (blob && blob.size > 0) {
                        blobData = blob;
                        break;
                    }
                } catch (err) { console.warn('Proxy failed in zip:', proxyUrl); }
            }

            if (blobData) {
                folder.file(`${currentTitle.substring(0, 50)}.mp4`, blobData);
                count++;
            }
        }));
    }

    if (count > 0) {
        zipBtn.innerText = 'Đang tạo file ZIP...';
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "tiktok_batch_downloads.zip");
        zipBtn.innerText = 'Tải về hoàn tất!';
    } else {
        const confirmAuto = confirm('Không thể tạo file ZIP do giới hạn trình duyệt. Bạn có muốn hệ thống tự động tải xuống từng video một không? (Lưu ý: Bạn cần cho phép trình duyệt tải nhiều file)');
        if (confirmAuto) {
            zipBtn.innerText = 'Đang tải hàng loạt...';
            for (let i = 0; i < videosToDownload.length; i++) {
                const video = videosToDownload[i];
                zipBtn.innerText = `Đang tải ${i+1}/${videosToDownload.length}...`;
                const itemEls = itemList.querySelectorAll('.video-item');
                let currentTitle = video.title;
                itemEls.forEach(el => {
                    if (el.querySelector('.item-url').innerText === video.originalUrl) {
                        currentTitle = el.querySelector('.item-title').innerText;
                    }
                });
                await downloadFile(video.url, `${currentTitle.substring(0, 50)}.mp4`);
                await new Promise(r => setTimeout(r, 1500)); // Delay to prevent browser blocking
            }
            zipBtn.innerText = 'Đã tải xong toàn bộ!';
        } else {
            zipBtn.innerText = 'Tải về thất bại';
        }
    }

    zipBtn.disabled = false;
    zipBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        Tải về file ZIP (.zip)
    `;
});

clearBtn.addEventListener('click', () => {
    linksArea.value = '';
    progressSection.style.display = 'none';
    startBtn.disabled = false;
});

function createItemElement(url) {
    const div = document.createElement('div');
    div.className = 'video-item';
    div.innerHTML = `
        <div class="item-info">
            <img src="" class="video-thumb" style="display:none;">
            <div class="item-status"></div>
            <div class="item-details">
                <span class="item-title" contenteditable="true" title="Bấm để đổi tên file">Đang lấy dữ liệu...</span>
                <span class="item-url">${url}</span>
            </div>
        </div>
        <div class="item-actions">
            <span class="status-text">Chờ...</span>
            <button class="individual-dl" style="display:none;">Tải lẻ</button>
        </div>
    `;
    return div;
}

async function downloadFile(url, filename) {
    const proxies = [
        `https://corsproxy.io/?${encodeURIComponent(url)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ];

    for (const targetUrl of proxies) {
        try {
            const response = await fetch(targetUrl);
            if (!response.ok) throw new Error('Network response was not ok');
            const blob = await response.blob();
            
            if (blob && blob.size > 0) {
                const blobUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                setTimeout(() => {
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(blobUrl);
                }, 100);
                return true;
            }
        } catch (e) {
            console.warn(`Proxy failed: ${targetUrl}`, e);
        }
    }
    return false;
}

function updateStatus(el, status, downloadUrl = null, title = null, cover = null) {
    if (!el) return;
    el.classList.remove('loading', 'success', 'error');
    el.classList.add(status);
    const text = el.querySelector('.status-text');
    const dlBtn = el.querySelector('.individual-dl');
    const thumb = el.querySelector('.video-thumb');
    const titleEl = el.querySelector('.item-title');
    
    if (status === 'loading' && text) text.innerText = 'Đang xử lý...';
    if (status === 'success') {
        if (text) text.innerText = 'Sẵn sàng';
        if (title && titleEl) titleEl.innerText = title;
        if (cover && thumb) {
            thumb.src = cover;
            thumb.style.display = 'block';
        }
        
        if (downloadUrl && dlBtn) {
            dlBtn.style.display = 'inline-block';
            dlBtn.onclick = async () => {
                const currentTitle = titleEl.innerText || 'tiktok_video';
                dlBtn.innerText = 'Đang tải...';
                dlBtn.disabled = true;
                const success = await downloadFile(downloadUrl, `${currentTitle.substring(0, 50)}.mp4`);
                if (!success) {
                    window.open(downloadUrl, '_blank');
                } else {
                    dlBtn.innerText = 'Đã tải';
                }
                dlBtn.disabled = false;
                setTimeout(() => { dlBtn.innerText = 'Tải lẻ'; }, 2000);
            };
        }
    }
    if (status === 'error') {
        if (text) text.innerText = 'Lỗi';
        if (titleEl) titleEl.innerText = 'Lỗi xử lý link (Video có thể bị xóa/riêng tư)';
    }
}

function updateProgress(current, total) {
    const percent = (current / total) * 100;
    progressBar.style.width = `${percent}%`;
    progressPercent.innerText = `${current}/${total}`;
    if (current < total) {
        progressStatus.innerText = `Đang xử lý link thứ ${current + 1}...`;
    }
}
