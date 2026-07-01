# Konfiguracja MySQL - Instrukcja Uruchomienia

## 📋 Dane do bazy danych (już ustawione w `.env`)

```
Host: sql7.freesqldatabase.com
Database: sql7817074
User: sql7817074
Password: sErdPZnxyv
Port: 3306
```

## 🚀 Kroki do załadowania schematu

### Opcja 1: Używając phpMyAdmin (ŁATWE)

1. Otwórz przeglądarkę i przejdź na: [https://www.freesqldatabase.com/phpmyadmin/](https://www.freesqldatabase.com/phpmyadmin/)

2. Zaloguj się:
   - **Username**: `sql7817074`
   - **Password**: `sErdPZnxyv`

3. Z lewego menu wybierz bazę danych `sql7817074`

4. Kliknij na zakładkę **"Import"**

5. Kliknij **"Wybierz plik"** i wybierz plik `db_schema.sql` z projektu

6. Kliknij **"Go"** (Import)

7. Czekaj, aż się załaduje (powinno być kilka sekund)

### Opcja 2: Używając MySQL CLI

```bash
# Podłącz się do MySQL
mysql -h sql7.freesqldatabase.com -u sql7817074 -p

# Wpisz hasło: sErdPZnxyv

# W konsoli MySQL wykonaj:
USE sql7817074;
SOURCE /path/to/db_schema.sql;
```

### Opcja 3: Używając aplikacji MySQL (np. MySQL Workbench)

1. Utwórz nowe połączenie z MySQL
2. Wpisz dane:
   - Host: `sql7.freesqldatabase.com`
   - Port: `3306`
   - User: `sql7817074`
   - Password: `sErdPZnxyv`

3. Otwórz plik `db_schema.sql` w aplikacji
4. Wykonaj skrypt (Ctrl+Shift+Enter lub kliknij Run)

## ✅ Co zawiera schemat?

Schema zawiera tabele dla wszystkich modulów:

- **Użytkownicy**: `administrators`, `drivers`, `dispatchers`, `support_agents`, `accounting_users`
- **Zlecenia**: `orders`
- **Strefy**: `zones`, `regions`, `taxi_codes`
- **Konfiguracja**: `pricing_rules`, `database_connections`, `map_tokens`
- **Komunikacja**: `chat_messages`
- **Historyczne**: `driver_queue`, `driver_history`, `custom_addresses`

## 🧪 Dane testowe

Schema zawiera gotowe konta testowe:

| Rola | Email | Hasło |
|------|-------|-------|
| Admin | admin@taxi.com | password |
| Kierowca | driver@taxi.com | password |
| Dyspozytor | dispatcher@taxi.com | password |
| Wsparcie | support@taxi.com | password |
| Księgowość | accounting@taxi.com | password |

## 🔄 Plik .env

Plik `.env` w projekcie jest już skonfigurowany:

```env
VITE_MYSQL_HOST=sql7.freesqldatabase.com
VITE_MYSQL_PORT=3306
VITE_MYSQL_USER=sql7817074
VITE_MYSQL_PASSWORD=sErdPZnxyv
VITE_MYSQL_DATABASE=sql7817074
```

## ✨ Uruchomienie aplikacji

Po załadowaniu schematu:

```bash
npm run dev
```

Aplikacja automatycznie połączy się z MySQL i będzie używać bazy danych zamiast lokalnego storage.

## 🐛 Rozwiązywanie problemów

### "Connection refused" lub "Unknown host"
- Sprawdź połączenie internetowe
- Upewnij się, że host `sql7.freesqldatabase.com` jest dostępny
- Spróbuj się zalogować na phpMyAdmin

### "Access denied for user"
- Sprawdź dokładnie hasło (zwróć uwagę na wielkość liter)
- Sprawdź czy wpisałeś prawidłową nazwę użytkownika `sql7817074`

### Tabele się nie tworzą
- Sprawdź czy baza danych `sql7817074` istnieje
- Spróbuj zalogować się na phpMyAdmin i sprawdzić bezpośrednio

## 📝 Dodatkowe informacje

- Baza danych używa charset `utf8mb4` (obsługuje emoji i znaki międzynarodowe)
- Silnik: InnoDB (obsługuje transakcje i foreign keys)
- Automatyczne timestampy na wszystkich tabelach

Gotowe! 🚀
