#!/usr/bin/env python3
"""
Example MCP client for the Druids multi-agent system.
This script demonstrates how to connect to and interact with the Druids MCP server.

Usage:
    python examples/mcp_client_example.py
"""

import json
import requests
from typing import Dict, Any, List

class DruidsMCPClient:
    """Simple MCP client for the Druids system."""
    
    def __init__(self, base_url: str = "http://localhost:3003"):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'DruidsMCPClient/1.0.0'
        })
    
    def health_check(self) -> Dict[str, Any]:
        """Check if the MCP server is healthy."""
        response = self.session.get(f"{self.base_url}/health")
        response.raise_for_status()
        return response.json()
    
    def get_capabilities(self) -> Dict[str, Any]:
        """Get server capabilities."""
        response = self.session.get(f"{self.base_url}/mcp/capabilities")
        response.raise_for_status()
        return response.json()
    
    def list_tools(self) -> List[Dict[str, Any]]:
        """List available tools."""
        response = self.session.get(f"{self.base_url}/mcp/tools")
        response.raise_for_status()
        return response.json()['tools']
    
    def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool with given arguments."""
        payload = {"arguments": arguments}
        response = self.session.post(
            f"{self.base_url}/mcp/tools/{tool_name}/call",
            json=payload
        )
        response.raise_for_status()
        return response.json()
    
    def list_resources(self) -> List[Dict[str, Any]]:
        """List available resources."""
        response = self.session.get(f"{self.base_url}/mcp/resources")
        response.raise_for_status()
        return response.json()['resources']
    
    def get_resource(self, resource_id: str) -> Dict[str, Any]:
        """Get a specific resource."""
        response = self.session.get(f"{self.base_url}/mcp/resources/{resource_id}")
        response.raise_for_status()
        return response.json()
    
    def list_prompts(self) -> List[Dict[str, Any]]:
        """List available prompts."""
        response = self.session.get(f"{self.base_url}/mcp/prompts")
        response.raise_for_status()
        return response.json()['prompts']
    
    def execute_prompt(self, prompt_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a prompt with given arguments."""
        payload = {"arguments": arguments}
        response = self.session.post(
            f"{self.base_url}/mcp/prompts/{prompt_name}",
            json=payload
        )
        response.raise_for_status()
        return response.json()

def main():
    """Example usage of the Druids MCP client."""
    client = DruidsMCPClient()
    
    try:
        # Check server health
        print("🔍 Checking server health...")
        health = client.health_check()
        print(f"✅ Server is healthy: {health['status']}")
        print()
        
        # Get capabilities
        print("🔧 Getting server capabilities...")
        capabilities = client.get_capabilities()
        print(f"📋 Server: {capabilities['implementation']['name']} v{capabilities['implementation']['version']}")
        print()
        
        # List available tools
        print("🛠️ Available tools:")
        tools = client.list_tools()
        for tool in tools:
            print(f"  • {tool['name']}: {tool['description']}")
        print()
        
        # Example: Create a realm
        print("🏞️ Creating a test realm...")
        realm_result = client.call_tool("realm_create", {
            "name": "Python Client Test Realm",
            "type": "forest",
            "description": "A test realm created via Python MCP client"
        })
        print(f"✅ Realm creation result: {realm_result['content'][0]['text']}")
        print()
        
        # Example: Create an agent
        print("🧙‍♂️ Creating a test agent...")
        agent_result = client.call_tool("agent_create", {
            "name": "Python Test Druid",
            "type": "druid",
            "description": "A test druid created via Python MCP client",
            "realm": "Python Client Test Realm"
        })
        print(f"✅ Agent creation result: {agent_result['content'][0]['text']}")
        print()
        
        # Example: Execute a scenario
        print("🎭 Executing a test scenario...")
        scenario_result = client.call_tool("scenario_execute", {
            "name": "Python Client Test Scenario",
            "description": "Multi-agent collaboration test from Python client",
            "agents": ["Python Test Druid", "System Agent"]
        })
        print(f"✅ Scenario execution result: {scenario_result['content'][0]['text']}")
        print()
        
        # Example: Generate agent instructions
        print("📜 Generating agent instructions...")
        instructions = client.execute_prompt("agent_instruction", {
            "agent_type": "druid",
            "role": "forest guardian and ecosystem monitor"
        })
        print("📋 Generated instructions:")
        print(instructions['messages'][0]['content']['text'])
        print()
        
        # List available resources
        print("📚 Available resources:")
        resources = client.list_resources()
        for resource in resources:
            print(f"  • {resource['uri']}: {resource['description']}")
        print()
        
        print("🎉 All MCP operations completed successfully!")
        
    except requests.RequestException as e:
        print(f"❌ Error connecting to MCP server: {e}")
        print("💡 Make sure the Druids system is running: ./scripts/dev.sh start")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

if __name__ == "__main__":
    main()