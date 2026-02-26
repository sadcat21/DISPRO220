// Share Target Service Worker handler
// This file is imported by the main service worker

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname === '/share' && event.request.method === 'POST') {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      
      // Cache the shared data for the page to read
      const cache = await caches.open('share-target');
      await cache.put('/share-data', new Response(formData));
      
      // Redirect to the share page
      return Response.redirect('/share', 303);
    })());
  }
});
