console.log('Popup JS loaded!');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded fired!');

    const addBtn = document.getElementById('addUrl');
    console.log('Add button:', addBtn);

    if (addBtn) {
        addBtn.addEventListener('click', () => {
            console.log('Add button clicked!');
            alert('按钮正常工作!');
        });
    } else {
        console.error('找不到addUrl按钮!');
    }
});
