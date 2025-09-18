package config

import (
	"os"
	"time"
)

type ServerConfig struct {
	Address string
	Env     string
}

type DBConfig struct {
	URL             string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
}

type RedisConfig struct {
	Addr     string
	Password string
	DB       int
}

type AppConfig struct {
	Server ServerConfig
	DB     DBConfig
	Redis  RedisConfig
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func Load() AppConfig {
	return AppConfig{
		Server: ServerConfig{
			Address: getenv("API_ADDRESS", ":8080"),
			Env:     getenv("APP_ENV", "development"),
		},
		DB: DBConfig{
			URL:             getenv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/ally?sslmode=disable"),
			MaxOpenConns:    20,
			MaxIdleConns:    10,
			ConnMaxLifetime: 30 * time.Minute,
		},
		Redis: RedisConfig{
			Addr:     getenv("REDIS_ADDR", "127.0.0.1:6379"),
			Password: getenv("REDIS_PASSWORD", ""),
			DB:       0,
		},
	}
}
