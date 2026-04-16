#!/usr/bin/env python3
"""
Facebook Page Poster using Graph API
Publishes posts to MythologIQ Labs Facebook Page
"""

import os
import requests
import json
import sys
from pathlib import Path
from typing import Optional, Dict


class FacebookPoster:
    """Post to Facebook Page using Graph API"""
    
    def __init__(self):
        self.access_token = os.environ.get('FACEBOOK_PAGE_ACCESS_TOKEN')
        self.page_id = os.environ.get('FACEBOOK_PAGE_ID', 'mythologiqlabs')  # Can be ID or handle
        
        if not self.access_token:
            raise ValueError("FACEBOOK_PAGE_ACCESS_TOKEN not set in environment")
    
    def post_text(self, message: str) -> Dict:
        """Post a text-only update"""
        url = f"https://graph.facebook.com/v19.0/{self.page_id}/feed"
        
        params = {
            'message': message,
            'access_token': self.access_token
        }
        
        try:
            response = requests.post(url, params=params)
            data = response.json()
            
            if 'error' in data:
                print(f"❌ Error posting to Facebook: {data['error']['message']}")
                return {'success': False, 'error': data['error']}
            
            print(f"✅ Facebook post published! ID: {data.get('id')}")
            return {'success': True, 'post_id': data.get('id')}
            
        except Exception as e:
            print(f"❌ Exception posting to Facebook: {e}")
            return {'success': False, 'error': str(e)}
    
    def post_with_image(self, message: str, image_path: str) -> Dict:
        """Post with an attached image"""
        # First, upload the image
        upload_url = f"https://graph.facebook.com/v19.0/{self.page_id}/photos"
        
        if not Path(image_path).exists():
            print(f"❌ Image file not found: {image_path}")
            return {'success': False, 'error': 'Image file not found'}
        
        params = {
            'message': message,
            'access_token': self.access_token
        }
        
        try:
            with open(image_path, 'rb') as image_file:
                files = {'source': image_file}
                response = requests.post(upload_url, params=params, files=files)
                data = response.json()
            
            if 'error' in data:
                print(f"❌ Error posting image to Facebook: {data['error']['message']}")
                return {'success': False, 'error': data['error']}
            
            print(f"✅ Facebook post with image published! ID: {data.get('id')}")
            return {'success': True, 'post_id': data.get('id')}
            
        except Exception as e:
            print(f"❌ Exception posting image to Facebook: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_page_info(self) -> Optional[Dict]:
        """Get page information"""
        url = f"https://graph.facebook.com/v19.0/{self.page_id}"
        params = {
            'fields': 'name,about,fan_count,category',
            'access_token': self.access_token
        }
        
        try:
            response = requests.get(url, params=params)
            data = response.json()
            
            if 'error' in data:
                return None
            
            return data
        except:
            return None


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Post to Facebook Page")
    parser.add_argument("--message", help="Post message (required unless --verify)")
    parser.add_argument("--image", help="Path to image file")
    parser.add_argument("--verify", action="store_true", help="Verify token and page access")
    
    args = parser.parse_args()
    
    # Require message unless verifying
    if not args.verify and not args.message:
        parser.error("--message is required unless using --verify")
    
    try:
        poster = FacebookPoster()
        
        if args.verify:
            page_info = poster.get_page_info()
            if page_info:
                print(f"✅ Connected to Facebook Page: {page_info.get('name')}")
                print(f"   Fans: {page_info.get('fan_count')}")
                print(f"   Category: {page_info.get('category')}")
                return
            else:
                print("❌ Failed to connect to Facebook Page")
                return
        
        if args.image:
            poster.post_with_image(args.message, args.image)
        else:
            poster.post_text(args.message)
            
    except ValueError as e:
        print(f"❌ Configuration error: {e}")
        print("\n📋 To set up Facebook API access:")
        print("   1. Go to https://developers.facebook.com/apps/")
        print("   2. Create an app (Type: Business)")
        print("   3. Add 'pages_read_engagement' and 'pages_manage_posts' permissions")
        print("   4. Generate a Page Access Token")
        print("   5. Add to Zo settings: FACEBOOK_PAGE_ACCESS_TOKEN=<your_token>")
        print("   6. Set FACEBOOK_PAGE_ID=107257933 (or your page ID)")


if __name__ == "__main__":
    main()
