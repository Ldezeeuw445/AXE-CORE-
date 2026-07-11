Dit bestand bevat de wijzigingen voor de mobile layout. Het moet worden hernoemd naar Home.tsx.

Wijzigingen:
1. 3D sphere: 45vh → 58vh (groter)
2. Chat: calc(55vh - 120px) → calc(42vh - 108px) (kleiner)
3. Chat minHeight: 200 → 140
4. Chat container: flex-1 → flex-shrink-0
5. Mobile container: overflow-y-auto → overflow-hidden
6. Hamburger menu (☰) VERWIJDERD uit chat header
7. Left swipe handle toegevoegd (opent AI Core + Timeline)
8. Right swipe handle toegevoegd (opent Tools)
9. mobileLeftSidebarContent toegevoegd (zonder chat)
10. MobileLeftDrawer gebruikt nu mobileLeftSidebarContent