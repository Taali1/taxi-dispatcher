# 🔑 Dodanie Master Kont Właściciela - Instrukcja

## 📋 Co zawiera plik `add_master_accounts.sql`?

Plik dodaje master konta z dostępem do **wszystkich paneli** z następującymi danymi:

| Pole | Wartość |
|------|---------|
| **Login** | `68233177` |
| **Hasło** | `68233177` |
| **Status** | Active (aktywne) |

## 🎯 Konta które będą dodane:

1. **Administrator (Właściciel)** - pełna kontrola systemu
2. **Kierowca (Właściciel)** - dostęp do aplikacji kierowcy
3. **Dyspozytor (Właściciel)** - zarządzanie zleceniami
4. **Wsparcie (Właściciel)** - obsługa klientów
5. **Księgowość (Właściciel)** - zarządzanie finansami

## 🚀 Jak załadować do bazy danych?

### Opcja 1: phpMyAdmin (NAJŁATWIEJ) ⭐

1. Otwórz: https://www.freesqldatabase.com/phpmyadmin/
2. Zaloguj się:
   - **Username**: `sql7817074`
   - **Password**: `sErdPZnxyv`

3. Wybierz bazę `sql7817074` z lewego menu

4. Kliknij zakładkę **"Import"**

5. Kliknij **"Choose File"** i wybierz `add_master_accounts.sql`

6. Kliknij przycisk **"Go"**

7. Czekaj na komunikat "Success" (powinna być sekunda)

### Opcja 2: MySQL CLI

```bash
mysql -h sql7.freesqldatabase.com -u sql7817074 -p

# Wpisz hasło: sErdPZnxyv

# W konsoli MySQL:
USE sql7817074;
SOURCE /path/to/add_master_accounts.sql;
```

### Opcja 3: MySQL Workbench

1. Otwórz połączenie do bazy
2. File → Open SQL Script
3. Wybierz `add_master_accounts.sql`
4. Execute (Ctrl+Shift+Enter)

## ✅ Weryfikacja

Po załadowaniu powinieneś zobaczyć w phpMyAdmin:

```
MASTER ACCOUNTS Summary

--- ADMINISTRATORS ---
| id | email | name | password | status |
| master_admin | 68233177 | Administrator (Właściciel) | 68233177 | active |

--- DRIVERS ---
| master_driver | 68233177 | Kierowca (Właściciel) | 68233177 | active |

--- DISPATCHERS ---
| master_dispatcher | 68233177 | Dyspozytor (Właściciel) | 68233177 | active |

--- SUPPORT AGENTS ---
| master_support | 68233177 | Wsparcie (Właściciel) | 68233177 | active |

--- ACCOUNTING USERS ---
| master_accounting | 68233177 | Księgowość (Właściciel) | 68233177 | active |
```

## 🔐 Logowanie z nowymi kontami

Po załadowaniu możesz się zalogować:

1. Otwórz http://localhost:5173/
2. Kliknij na dowolny panel logowania
3. Wpisz:
   - **Login**: `68233177`
   - **Hasło**: `68233177`
4. Kliknij "Zaloguj się"

## 📝 Ważne informacje

- Każde konto ma pełne uprawnienia w swoim panelu
- Konta można zmienić/usunąć z phpMyAdmin
- Hasła są przechowywane w czystym tekście (w produkcji powinny być zahaszowane)
- Konta obowiązują w systemie i w aplikacji mobilnej kierowcy

## 🎯 Jeśli chcesz zmienić hasło

Wejdź w phpMyAdmin:

1. Przejdź do tabeli (np. `administrators`)
2. Kliknij "Edit" przy konto `master_admin`
3. Zmień pole `password`
4. Kliknij "Save"

---

**Gotowe! Masz teraz dostęp do wszystkich paneli! 🎉**
