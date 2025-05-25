# SFDC Integration Strategy for Quick-MCP

## Overview

Based on actual Salesforce documentation, Salesforce uses specific `x-sfdc` OpenAPI extensions for Agentforce integration. This document outlines how Quick-MCP can provide compatibility with these extensions and offer value to Salesforce developers.

## Actual Salesforce x-sfdc Extensions

From Salesforce's official documentation, the following `x-sfdc` extensions exist:

### **Documented x-sfdc Extensions**

| Extension Field | Purpose | Level | Description |
|----------------|---------|--------|-------------|
| `x-sfdc-publishAsAgentAction` | Enable agent action creation | Operation | Creates a custom agent action from the API |
| `x-sfdc-isUserInput` | Mark user input parameters | Parameter | Indicates a parameter should be populated by user input |
| `x-sfdc-isDisplayable` | Control response display | Response | Determines if a successful response can be shown in conversation |

### **Example Usage in OpenAPI**
```yaml
paths:
  /restaurants:
    get:
      summary: Find restaurants
      x-sfdc-publishAsAgentAction: true
      parameters:
        - name: minAvgReviewScore
          in: query
          schema:
            type: number
          x-sfdc-isUserInput: true
      responses:
        '200':
          description: Restaurant list
          x-sfdc-isDisplayable: true
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Restaurant'
```

## Quick-MCP Integration Strategy

### **Phase 1: Basic SFDC Compatibility (Weeks 1-3)**

**Goal**: Enable Quick-MCP to generate OpenAPI specs with x-sfdc extensions for Salesforce Agentforce compatibility.

#### **Extended Overlay Schema**
```toml
# .quick-mcp/overlays/findRestaurants.toml
# Standard Quick-MCP annotations
intent = "lookup"
semantic_type = "entity:Restaurant"
example_prompts = [
  "Find restaurants with good reviews",
  "Show me restaurants rated above 4 stars"
]

# SFDC-specific extensions
[sfdc]
publish_as_agent_action = true
response_displayable = true

# Parameter-level SFDC settings
[sfdc.parameters.minAvgReviewScore]
is_user_input = true
```

#### **Generated x-sfdc Output**
Quick-MCP would generate OpenAPI with embedded x-sfdc extensions:
```yaml
paths:
  /restaurants:
    get:
      summary: Find restaurants
      x-sfdc-publishAsAgentAction: true
      parameters:
        - name: minAvgReviewScore
          in: query
          x-sfdc-isUserInput: true
      responses:
        '200':
          x-sfdc-isDisplayable: true
```

### **Phase 2: Dual Export Mode (Weeks 4-6)**

#### **CLI Interface**
```bash
# Standard MCP output (default)
quick-mcp openapi.yaml

# Salesforce-compatible output
quick-mcp openapi.yaml --format=sfdc

# Combined output with both MCP and SFDC extensions
quick-mcp openapi.yaml --format=hybrid
```

#### **Implementation Details**
- Add `--format` flag to CLI
- Extend overlay parser to handle `[sfdc]` sections
- Create mapping layer from overlay settings to x-sfdc extensions
- Validate compatibility with Salesforce Agent Apex requirements

### **Phase 3: Enhanced SFDC Features (Weeks 7-10)**

#### **Advanced Overlay Configuration**
```toml
[sfdc]
# Core agent action settings
publish_as_agent_action = true
response_displayable = true

# Enhanced control (if more extensions are discovered)
agent_topic = "Restaurant Management"
requires_authentication = true

# Parameter-level controls
[sfdc.parameters]
minAvgReviewScore = { is_user_input = true, required = true }
location = { is_user_input = true, default_value = "current location" }
```

#### **Developer Experience Improvements**
- SFDX integration for importing existing Apex REST classes
- Salesforce-specific validation rules
- Templates and examples for common Salesforce patterns
- Documentation tailored for Salesforce developers

## Market Value Proposition

### **For Salesforce Developers**
1. **Unified Tooling**: Use same workflow for both MCP and Salesforce agent development
2. **Skills Transfer**: Leverage OpenAPI knowledge across ecosystems
3. **Extended Reach**: Connect Salesforce agents to external APIs via MCP
4. **Rapid Prototyping**: Quick iteration on agent action definitions

### **For MCP Developers**
1. **Enterprise Access**: Salesforce compatibility opens enterprise markets
2. **Proven Patterns**: Learn from Salesforce's mature agent experience
3. **Broader Ecosystem**: Access to large Salesforce developer community

## Implementation Priorities

### **High Priority**
- [ ] Basic x-sfdc extension support in overlays
- [ ] `--format=sfdc` CLI option
- [ ] Validation for required Salesforce fields

### **Medium Priority**
- [ ] Parameter-level SFDC configuration
- [ ] Salesforce-specific documentation and examples
- [ ] Integration testing with Salesforce Agent Apex

### **Low Priority (Future)**
- [ ] SFDX toolchain integration
- [ ] Advanced governance features
- [ ] Salesforce org deployment automation

## Technical Considerations

### **Compatibility Constraints**
- Limited to documented x-sfdc extensions only
- Must validate against Salesforce's OpenAPI requirements
- Ensure no conflicts between MCP and SFDC annotation systems

### **Architectural Decisions**
1. **Optional Module**: SFDC features as separate, optional overlay sections
2. **Format-Specific Output**: Different CLI formats rather than mixed output
3. **Validation Separation**: Distinct validation rules for each target format

## Success Metrics

### **Adoption Indicators**
- Number of `--format=sfdc` exports generated
- Salesforce developer community engagement
- Successful Agentforce integrations using Quick-MCP

### **Technical Benchmarks**
- 100% compatibility with documented x-sfdc extensions
- Successful validation by Salesforce Agent Apex tooling
- Performance parity with native Salesforce tooling

## Risk Assessment

### **Technical Risks**
- **Limited Extension Set**: Only 3 documented x-sfdc extensions limits functionality
- **Salesforce Changes**: x-sfdc specification may evolve without notice
- **Validation Complexity**: Ensuring Salesforce compatibility may be challenging

### **Strategic Risks**
- **Limited Differentiation**: Basic x-sfdc support may not provide significant value
- **Resource Allocation**: SFDC features may distract from core MCP innovation
- **Platform Dependency**: Reliance on Salesforce's extension stability

## Recommendations

1. **Start Small**: Implement basic x-sfdc support as proof of concept
2. **Monitor Adoption**: Track usage of SFDC format to validate demand
3. **Community Engagement**: Connect with Salesforce developer community for feedback
4. **Incremental Expansion**: Add features based on actual developer needs

## Conclusion

While Salesforce's x-sfdc extensions are currently limited to three documented fields, they represent a valuable compatibility target for Quick-MCP. The implementation should be approached incrementally, focusing on proven value rather than speculative features. Success will depend on genuine developer demand from the Salesforce ecosystem.