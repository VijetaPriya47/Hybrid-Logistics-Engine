package authjwt

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	RoleCustomer  = "customer"
	RoleBusiness  = "business"
	RoleAdmin     = "admin"
)

type Claims struct {
	Email             string `json:"email"`
	Role              string `json:"role"`
	CanCreateAdmins   bool   `json:"can_create_admins,omitempty"`
	CanDeleteData     bool   `json:"can_delete_data,omitempty"`
	jwt.RegisteredClaims
}

func Sign(secret []byte, issuer, audience, sub, email, role string, ttl time.Duration, canCreateAdmins, canDeleteData bool) (string, error) {
	if len(secret) == 0 {
		return "", errors.New("empty jwt secret")
	}
	now := time.Now()
	claims := Claims{
		Email:           email,
		Role:            role,
		CanCreateAdmins: canCreateAdmins,
		CanDeleteData:   canDeleteData,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   sub,
			Issuer:    issuer,
			Audience:  jwt.ClaimStrings{audience},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	if role != RoleAdmin {
		claims.CanCreateAdmins = false
		claims.CanDeleteData = false
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, &claims)
	return t.SignedString(secret)
}

func Parse(secret []byte, issuer, audience, tokenStr string) (*Claims, error) {
	if len(secret) == 0 {
		return nil, errors.New("empty jwt secret")
	}
	tok, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method %v", t.Header["alg"])
		}
		return secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := tok.Claims.(*Claims)
	if !ok || !tok.Valid {
		return nil, errors.New("invalid token")
	}
	if issuer != "" && claims.Issuer != issuer {
		return nil, errors.New("invalid issuer")
	}
	if audience != "" {
		if err := jwt.NewValidator(jwt.WithAudience(audience)).Validate(claims); err != nil {
			return nil, err
		}
	}
	return claims, nil
}
